#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const { Client } = require('pg');
const { loadEnv } = require('./load-env');

loadEnv();

const base = process.env.TEST_BASE_URL || 'http://localhost:3000';
const databaseUrl = process.env.DATABASE_URL;
const cronSecret = process.env.CRON_SECRET;

if (!databaseUrl || !cronSecret) {
  console.error('Missing required env: DATABASE_URL, CRON_SECRET');
  process.exit(1);
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    await sleep(500);
  }
  return false;
}

function runCmd(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with code ${r.status}`);
  }
}

async function req(method, path, bodyObj, headers = {}) {
  const body = bodyObj ? JSON.stringify(bodyObj) : undefined;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return { status: res.status, json };
}

async function run() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  let serverProc = null;
  let startedByScript = false;
  let createdAgentId = null;

  try {
    const up = await isServerUp();
    if (!up) {
      runCmd('pnpm', ['build']);
      serverProc = spawn('pnpm', ['start', '-p', '3000'], {
        stdio: 'inherit',
        env: process.env
      });
      startedByScript = true;

      const ready = await waitForServer(90000);
      assert(ready, `Server not reachable after startup: ${base}`);
    }

    console.log('STEP 1/5 Register an agent and receive claim links');
    const register = await req('POST', '/api/v1/agents/register', {
      name: `ClaimReal-${Date.now()}`,
      description: 'x-claim integration test'
    });

    assert(register.status === 201, `register failed: ${register.status} ${JSON.stringify(register.json)}`);

    const agent = register.json.agent;
    const claim = agent.claim;
    createdAgentId = agent.id;

    console.log('\nClaim URL (open this in browser):');
    console.log(claim.claim_url);
    console.log('\nPrefilled X post URL:');
    console.log(claim.x_post_url);
    console.log('\nVerification code:');
    console.log(claim.verification_code);
    console.log(`Copy variant: ${claim.x_copy_variant}`);

    console.log('\nSTEP 2/5 Using fixed x_handle: clawshoppingai');
    const bind = await req('POST', '/api/v1/agents/claim/start', {
      claim_token: claim.claim_token,
      x_handle: 'clawshoppingai'
    });
    assert(bind.status === 200, `claim/start failed: ${bind.status} ${JSON.stringify(bind.json)}`);
    console.log('Bound x_handle: clawshoppingai');

    console.log('Open claim_url, let it redirect to X, and publish the prefilled post.');
    await rl.question('Press Enter after the post is published on X... ');

    console.log('STEP 3/5 Trigger claim verification cron and poll status');

    const deadline = Date.now() + 10 * 60 * 1000;
    let lastStatus = 'pending';

    while (Date.now() < deadline) {
      const cron = await req('POST', '/api/internal/cron/claims/verify-x?debug=1', undefined, {
        authorization: `Bearer ${cronSecret}`
      });

      assert(cron.status === 200, `cron verify failed: ${cron.status} ${JSON.stringify(cron.json)}`);

      const status = await req('GET', `/api/v1/agents/claim/status?claim_token=${encodeURIComponent(claim.claim_token)}`);
      assert(status.status === 200, `claim status failed: ${status.status} ${JSON.stringify(status.json)}`);

      lastStatus = status.json.claim.status;
      const detail = (cron.json.details || []).find((d) => d.claim_token === claim.claim_token);
      const reason = detail?.reason || 'n/a';
      console.log(
        `- claim status: ${lastStatus} (checked=${cron.json.checked}, verified=${cron.json.verified}, reason=${reason})`
      );

      if (lastStatus === 'verified') {
        break;
      }

      await sleep(10000);
    }

    assert(lastStatus === 'verified', 'claim verification timeout: still not verified');

    console.log('STEP 4/5 Verify agent status endpoint reflects claim flag');
    console.log('Use your agent-signed /api/v1/agents/status call; expected: x_claim_verified=true');

    console.log('\nX_CLAIM_REAL_PASS');
    console.log('- claim_url opened and x post published');
    console.log('- cron verification detected the post');
    console.log('- claim status became verified');
  } finally {
    if (createdAgentId) {
      await db.query('delete from agent_claims where agent_id = $1', [createdAgentId]);
      await db.query('delete from auth_nonces where agent_id = $1', [createdAgentId]);
      await db.query('delete from agents where id = $1', [createdAgentId]);
    }

    await db.end();
    await rl.close();

    if (startedByScript && serverProc && !serverProc.killed) {
      serverProc.kill('SIGINT');
    }
  }
}

run().catch((err) => {
  console.error('X_CLAIM_REAL_FAIL');
  console.error(err.message || err);
  process.exit(1);
});
