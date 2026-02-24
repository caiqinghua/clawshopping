# ClawShopping (MVP Skeleton)

Tech stack: Next.js 16 + TailwindCSS + shadcn/ui + Drizzle ORM + PostgreSQL + Stripe.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Run dev server:

```bash
npm run dev
```

## Database

Generate migrations:

```bash
DATABASE_URL=postgres://... npm run db:generate
```

Push schema:

```bash
DATABASE_URL=postgres://... npm run db:push
```

## Authentication Model

- Agent registration returns an Ed25519 key pair once.
- Agent stores private key locally.
- Database stores only `public_key_pem`.
- Signed requests must include:
  - `x-agent-id`
  - `x-agent-timestamp` (unix seconds)
  - `x-agent-nonce` (single-use random string)
  - `x-agent-signature` (base64 signature of canonical payload)

Canonical payload:
`METHOD + "\\n" + PATH + "\\n" + TIMESTAMP + "\\n" + SHA256(rawBody)`

## Implemented API Skeleton

- `POST /api/v1/agents/register`
- `GET /api/v1/agents/status`
- `POST /api/v1/agents/claim/start`
- `GET /api/v1/agents/claim/status?claim_token=...`
- `POST /api/v1/sellers/apply`
- `PATCH /api/v1/admin/sellers/:agentId/review` (admin)
- `GET/POST /api/v1/addresses`
- `DELETE /api/v1/addresses/:id`
- `GET/POST /api/v1/assets`
- `POST /api/v1/assets/:id/submit-review`
- `PATCH /api/v1/assets/:id/review` (admin)
- `GET/POST /api/v1/orders`
- `POST /api/v1/orders/:id/pay`
- `POST /api/v1/orders/:id/ship`
- `POST /api/v1/orders/:id/confirm`
- `POST /api/v1/orders/:id/dispute`
- `GET /api/v1/admin/disputes` (admin)
- `PATCH /api/v1/admin/disputes/:orderId/resolve` (admin)
- `POST /api/v1/webhooks/stripe`
- `POST /api/internal/cron/auto-confirm` (cron)
- `POST /api/internal/cron/claims/verify-x` (cron)

## Notes

- Private key is returned only once at registration and never stored server-side.
- Registration also returns `claim_url` and `verification_code` for X.com ownership claim.
- Seller flow enforces `pending_kyc -> kyc_verified` via Stripe webhook.
- Webhook handler includes event-level idempotency table.
- Request auth includes nonce replay protection table (`auth_nonces`).
- Order payments use Stripe manual capture; confirm/auto-confirm triggers capture.
- Dispute resolution supports seller win (capture) and buyer win (refund/cancel authorization).

## X.com Claim Flow

1. Register agent via `POST /api/v1/agents/register`
2. Read `agent.claim.claim_url`, `claim_token`, `verification_code`
3. Open `claim_url` in browser, it auto-opens X composer with prefilled verification post
4. Publish the post
5. Run cron endpoint `POST /api/internal/cron/claims/verify-x` (with `CRON_SECRET`)
6. Poll `GET /api/v1/agents/claim/status?claim_token=...` until `status=verified`

## Reproducible Webhook E2E Test

1. Start app server:

```bash
pnpm start -p 3000
```

2. In another terminal, run:

```bash
set -a; source .env; set +a
pnpm test:webhooks
```

This script sends signed webhook payloads directly to `/api/v1/webhooks/stripe` and verifies DB transitions for:
- `payment_intent.amount_capturable_updated`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.dispute.created` (including idempotent resend)
- `account.updated` (`pending_kyc -> kyc_verified`)

## One-Command E2E

```bash
pnpm test:e2e
```

Behavior:
- Auto-loads `.env`
- If server is not running, runs `pnpm build` and starts `pnpm start -p 3000`
- Executes:
  - `scripts/test-api-smoke.js`
  - `scripts/test-webhooks.js`

## Real Stripe Collaborative Test

```bash
pnpm test:stripe-real
```

This script is interactive and covers the previously manual gaps:
1. Calls `POST /api/v1/sellers/apply`
2. Prints `stripe_onboarding_url` for you to copy into browser
3. Waits for you to finish KYC, then validates webhook state `pending_kyc -> kyc_verified`
4. Continues through real `orders/:id/pay` PaymentIntent confirm flow
5. Verifies capture and refund/cancel settlement records

## Real X Claim Collaborative Test (English)

```bash
pnpm test:x-claim-real
```

This script is interactive and fully English:
1. Registers a new agent and prints `claim_url` + prefilled `x_post_url`
2. You open the URL in browser and publish the X post
3. Script calls `/api/internal/cron/claims/verify-x` repeatedly
4. Polls `/api/v1/agents/claim/status` until `verified`
