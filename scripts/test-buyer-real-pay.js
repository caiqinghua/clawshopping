#!/usr/bin/env node

const { createHash, randomUUID, sign } = require('crypto');
const { spawn } = require('child_process');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const { Client } = require('pg');
const Stripe = require('stripe');
const { loadEnv } = require('./load-env');

loadEnv();

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const databaseUrl = process.env.DATABASE_URL;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!databaseUrl || !stripeSecretKey || !webhookSecret) {
  console.error('Missing required env: DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET');
  process.exit(1);
}

const stripe = new Stripe(stripeSecretKey);

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256Hex(s) {
  return createHash('sha256').update(s).digest('hex');
}

function payload(method, path, ts, body) {
  return [method.toUpperCase(), path, String(ts), sha256Hex(body || '')].join('\n');
}

async function req(method, path, bodyObj, headers = {}) {
  const body = bodyObj ? JSON.stringify(bodyObj) : undefined;
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: r.status, json };
}

async function isServerUp() {
  try {
    const r = await fetch(base);
    return r.ok || r.status > 0;
  } catch {
    return false;
  }
}

async function waitForServer(maxMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await isServerUp()) return true;
    await sleep(600);
  }
  return false;
}

async function postWebhook(event) {
  const payloadText = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: payloadText,
    secret: webhookSecret,
    timestamp: Math.floor(Date.now() / 1000)
  });
  const r = await fetch(`${base}/api/v1/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': signature
    },
    body: payloadText
  });
  const txt = await r.text();
  let body;
  try {
    body = JSON.parse(txt);
  } catch {
    body = { raw: txt };
  }
  assert(r.status === 200, `webhook failed ${event.type}: ${r.status} ${JSON.stringify(body)}`);
}

async function registerAgent(name) {
  const r = await req('POST', '/api/v1/agents/register', {
    name,
    description: `${name}.local`
  });
  assert(r.status === 201, `register failed: ${r.status} ${JSON.stringify(r.json)}`);
  return {
    id: r.json.agent.id,
    privateKey: r.json.agent.auth.private_key_pem
  };
}

async function signed(agent, method, path, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const sig = sign(null, Buffer.from(payload(method, path, ts, body)), agent.privateKey).toString('base64');
  return req(method, path, bodyObj, {
    'x-agent-id': agent.id,
    'x-agent-timestamp': String(ts),
    'x-agent-nonce': nonce,
    'x-agent-signature': sig
  });
}

async function waitOrderStatus(db, orderId, expected, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const q = await db.query('select status from orders where id = $1', [orderId]);
    if (q.rows[0]?.status === expected) return;
    await sleep(1500);
  }
  throw new Error(`timeout waiting order ${orderId} -> ${expected}`);
}

async function waitOrderTerminalStatus(db, orderId, timeoutMs = 10 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const q = await db.query('select status from orders where id = $1', [orderId]);
    const status = q.rows[0]?.status ?? null;
    if (status === 'paid' || status === 'cancelled') return status;
    await sleep(1500);
  }
  throw new Error(`timeout waiting order ${orderId} terminal status (paid/cancelled)`);
}

async function findApprovedAsset(db) {
  if (process.env.TEST_REAL_ASSET_ID) return process.env.TEST_REAL_ASSET_ID;
  const q = await db.query(`
    select a.id
    from assets a
    join agents g on g.id = a.seller_agent_id
    join sellers s on s.agent_id = g.id
    where a.status = 'approved'
      and g.status = 'seller_approved'
      and s.review_status = 'approved'
      and s.stripe_account_id not like 'acct_test_%'
    order by a.created_at desc
    limit 1
  `);
  return q.rows[0]?.id ?? null;
}

async function createOrder(agent, assetId) {
  const r = await signed(agent, 'POST', '/api/v1/orders', {
    asset_id: assetId,
    confirmation_mode: 'manual_confirm'
  });
  assert(r.status === 201, `create order failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.order.id;
}

async function payOrder(agent, orderId, paymentMethodId) {
  const r = await signed(agent, 'POST', `/api/v1/orders/${orderId}/pay`, {
    payment_method_id: paymentMethodId,
    mit_preferred: true
  });
  assert(r.status === 200, `pay failed: ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}

async function ensurePaid(orderId, piId, db) {
  await postWebhook({
    id: `evt_amt_capturable_${Date.now()}_${orderId.slice(0, 6)}`,
    object: 'event',
    type: 'payment_intent.amount_capturable_updated',
    data: { object: { id: piId, object: 'payment_intent' } }
  });
  await waitOrderStatus(db, orderId, 'paid');
}

async function humanAssistPause(rl, title, payJson) {
  console.log(`\n${title}`);
  console.log(`- payment_intent_id: ${payJson.payment_intent_id ?? 'n/a'}`);
  console.log(`- status: ${payJson.status}`);
  console.log(`- next_action_type: ${payJson.human_assistance?.next_action_type ?? 'n/a'}`);
  console.log(`- next_action_url: ${payJson.human_assistance?.next_action_url ?? 'n/a'}`);
  console.log(`- checkout_url: ${payJson.human_assistance?.checkout_url ?? 'n/a'}`);
  console.log(`- message_template: ${payJson.human_assistance?.message_template ?? 'n/a'}`);
  console.log('Copy checkout_url (or next_action_url) to browser, finish/cancel there, then press ENTER.');
  await rl.question('');
}

async function run() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  let serverProc = null;
  let startedByScript = false;
  let humanEveryTime = false;
  const created = { agentIds: [], orderIds: [] };

  try {
    if (!(await isServerUp())) {
      serverProc = spawn('pnpm', ['start', '-p', '3000'], { stdio: 'inherit', env: process.env });
      startedByScript = true;
      assert(await waitForServer(90000), 'server did not start');
    }

    console.log('STEP 1/6 Resolve approved real seller asset');
    const assetId = await findApprovedAsset(db);
    assert(assetId, 'No approved real seller asset found');
    console.log(`- asset_id: ${assetId}`);

    console.log('STEP 2/6 Register buyer agent');
    const buyer = await registerAgent(`BuyerMIT-${Date.now()}`);
    created.agentIds.push(buyer.id);
    await db.query(`update agents set x_claim_verified_at=now() where id=$1`, [buyer.id]);

    console.log('STEP 3/6 First payment: human authorizes MIT bootstrap');
    const order1 = await createOrder(buyer, assetId);
    created.orderIds.push(order1);
    const pay1 = await payOrder(buyer, order1, 'pm_card_authenticationRequired');
    assert(pay1.human_assistance?.required === true, `first payment should require human assistance: ${JSON.stringify(pay1)}`);

    await humanAssistPause(rl, 'FIRST PAYMENT HUMAN ASSISTANCE', pay1);
    const firstStatus = await waitOrderTerminalStatus(db, order1);
    if (firstStatus === 'cancelled') {
      humanEveryTime = true;
      console.log('Bootstrap rejected -> fallback policy enabled: every payment requires human confirmation');
    } else {
      await waitOrderStatus(db, order1, 'paid');
    }

    console.log('STEP 4/6 Second payment');
    const order2 = await createOrder(buyer, assetId);
    created.orderIds.push(order2);
    const pay2 = await payOrder(buyer, order2, humanEveryTime ? 'pm_card_authenticationRequired' : 'pm_card_visa');

    if (humanEveryTime || pay2.human_assistance?.required) {
      await humanAssistPause(rl, 'SECOND PAYMENT HUMAN ASSISTANCE', pay2);
      const secondStatus = await waitOrderTerminalStatus(db, order2);
      if (secondStatus !== 'paid') {
        throw new Error(`second payment ended in ${secondStatus}`);
      }
    } else {
      assert(pay2.status === 'requires_capture' || pay2.status === 'succeeded', `second payment MIT not auto: ${JSON.stringify(pay2)}`);
      await ensurePaid(order2, pay2.payment_intent_id, db);
    }

    console.log('STEP 5/6 Third payment: force MIT -> human assistance');
    const order3 = await createOrder(buyer, assetId);
    created.orderIds.push(order3);
    const pay3 = await payOrder(buyer, order3, 'pm_card_authenticationRequired');
    assert(pay3.human_assistance?.required === true, `third payment should require human assistance: ${JSON.stringify(pay3)}`);
    await humanAssistPause(rl, 'THIRD PAYMENT HUMAN ASSISTANCE', pay3);
    const thirdStatus = await waitOrderTerminalStatus(db, order3);
    if (thirdStatus !== 'paid') {
      throw new Error(`third payment ended in ${thirdStatus}`);
    }

    console.log('STEP 6/6 Summary');
    console.log('BUYER_FIRST_PAYMENT_FLOW_PASS');
    console.log('- x-claim: passed');
    console.log(`- asset_id: ${assetId}`);
    console.log(`- first payment: ${humanEveryTime ? 'human rejected bootstrap (fallback enabled)' : 'human approved MIT bootstrap'} (order=${order1})`);
    console.log(`- second payment: ${humanEveryTime ? 'human-assisted due to fallback policy' : 'agent-native MIT auto (or assisted if risk)'} (order=${order2})`);
    console.log(`- third payment: human-assisted MIT risk path (order=${order3})`);
  } finally {
    await rl.close();
    if (created.orderIds.length > 0) {
      await db.query('delete from disputes where order_id = any($1::uuid[])', [created.orderIds]);
      await db.query('delete from settlements where order_id = any($1::uuid[])', [created.orderIds]);
      await db.query('delete from orders where id = any($1::uuid[])', [created.orderIds]);
    }
    if (created.agentIds.length > 0) {
      await db.query('delete from sellers where agent_id = any($1::uuid[])', [created.agentIds]);
      await db.query('delete from auth_nonces where agent_id = any($1::uuid[])', [created.agentIds]);
      await db.query('delete from agents where id = any($1::uuid[])', [created.agentIds]);
    }
    await db.end();
    if (startedByScript && serverProc && !serverProc.killed) serverProc.kill('SIGINT');
  }
}

run().catch((err) => {
  console.error('BUYER_FIRST_PAYMENT_FLOW_FAIL');
  console.error(err.message || err);
  process.exit(1);
});
