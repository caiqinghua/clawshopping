---
name: clawshopping
description: Build and operate ClawShopping, an agent-native escrow commerce infrastructure. Use this skill when implementing or modifying Next.js 16 + Tailwind + shadcn + Drizzle + PostgreSQL systems for agent registration, heartbeat polling, Stripe Connect KYC onboarding, seller approval workflows, asset listing, escrow orders, webhook handling, disputes, risk controls, or MVP scoping decisions for agent-to-agent transactions.
---

# ClawShopping

## Overview

Implement ClawShopping as a centralized, API-first marketplace where AI agents are the only account entity.
Enforce escrow-first transaction flow, Stripe-driven compliance, and queryable lifecycle states for all critical operations.

## Skill Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Execution workflow and guardrails |
| `references/domain-model.md` | Drizzle/PostgreSQL schema and enums |
| `references/api-contracts.md` | API routes, request and response contracts |
| `references/state-machines.md` | Status transitions, cron logic, dispute rules |
| `references/payments-compliance.md` | Stripe Connect onboarding, webhooks, payout gating |
| `references/mvp-scope.md` | MVP boundaries and non-goals |

## Non-Negotiable Rules

1. Treat `agents` as the only user/account table.
2. Keep humans out of product auth and in-app identity; allow human participation only in Stripe KYC actions.
3. Keep funds escrowed on platform-controlled flow; release only after confirmation or timeout policy.
4. Persist every critical status as API-queryable state.
5. Keep MVP lean: USD only, card only, Stripe only, no wallet, no chat, no multi-currency.

## Execution Workflow

1. Implement schema and enums first.
Load `references/domain-model.md` and codify Drizzle schema before API work.

2. Implement agent registration and auth primitives.
Start with `POST /api/v1/agents/register`, API key hashing, and `GET /api/v1/agents/status`.

3. Implement seller activation with Stripe Connect.
Use `POST /api/v1/sellers/apply`, onboarding links, webhook processing, and admin review gates.

4. Implement assets and order pipeline.
Apply status machines from `references/state-machines.md` and snapshot shipping address on order creation.

5. Implement escrow payment and release automation.
Follow `references/payments-compliance.md` for Destination Charges and release conditions.

6. Add risk controls and operational jobs.
Enforce new seller rate limits, anomaly triggers, large-order confirmation extension, and cron-based auto-confirm.

7. Validate against MVP scope before adding features.
Reject scope creep unless explicitly asked; use `references/mvp-scope.md`.

## Build Guidelines (Next.js Stack)

1. Use Next.js 16 route handlers for API endpoints under `app/api/v1/.../route.ts`.
2. Use Drizzle ORM for schema and migration management; keep enum values centralized and shared.
3. Use PostgreSQL as source of truth for transactional states.
4. Use Redis only for ephemeral risk counters, throttling, and idempotency helpers.
5. Keep webhook handlers idempotent and signature-verified.
6. Use Tailwind + shadcn only for admin/review surfaces; keep agent flows API-first.

## API and State Contracts

Read these references before coding business logic:
- `references/api-contracts.md`
- `references/state-machines.md`
- `references/payments-compliance.md`

## Security and Compliance Guardrails

1. Never store raw API keys; persist salted hash only.
2. Never trust client-supplied order amounts when charging; recompute from `asset` snapshot or server-side pricing policy.
3. Never release seller funds before confirmation condition is met.
4. Never mark seller as active solely from local state; require Stripe + manual review.
5. Never mutate historical address snapshots attached to orders.

## Done Criteria

Consider implementation complete only when:
1. Core registration, seller activation, asset listing, and order flow APIs are present.
2. Stripe onboarding + webhook transitions are idempotent and tested.
3. Status transitions match `references/state-machines.md`.
4. Risk controls and cron auto-confirm jobs are enforced.
5. MVP constraints are respected with no hidden wallet/human-account assumptions.

## Quick Start Prompts

Use these user intents as trigger examples:
1. "Implement `/api/v1/agents/register` and `/api/v1/agents/status` with Drizzle schema."
2. "Design Stripe Connect seller onboarding and webhook transitions for KYC."
3. "Build order escrow state machine with confirm timeout and dispute support."
4. "Add MVP-grade risk limits for new sellers and large-value orders."
