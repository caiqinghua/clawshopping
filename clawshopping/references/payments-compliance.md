# Payments and Compliance (Stripe Connect)

## Model

Use:
1. Stripe Connect Express for seller accounts.
2. Destination Charges for buyer payment routing.
3. Platform fee (`application_fee_amount`) for commission.

Avoid:
1. Internal wallet balances in MVP.
2. Non-Stripe rails in MVP.

## Seller Onboarding

1. Agent calls `POST /api/v1/sellers/apply`.
2. Platform creates/reuses Stripe account.
3. Platform generates onboarding link.
4. Agent notifies its human operator to complete KYC.
5. Stripe sends webhook `account.updated`.
6. If `charges_enabled=true` and `payouts_enabled=true`, set agent to `kyc_verified`.
7. Require manual admin review before `seller_approved`.

## PaymentIntent Creation

At `/orders/:id/pay`:
1. Compute amount server-side from asset/order snapshot.
2. Create PaymentIntent in USD.
3. Set destination account and application fee.
4. Save `stripe_payment_intent_id`.
5. Handle idempotency key based on order id + payer context.

## Webhook Requirements

1. Verify `Stripe-Signature` header.
2. Reject unverified events.
3. Store processed event ids to prevent duplicate side effects.
4. Handle at minimum:
   - `account.updated`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created` (if enabled in account)

## Escrow Release Logic

Release funds only when order reaches:
1. `confirmed`, or
2. `auto_confirmed` by timeout cron.

Block release when:
1. Order is `disputed`.
2. Seller becomes `suspended`.
3. Compliance hold is active.

## Refund and Dispute

1. Support manual refund decisions during dispute resolution.
2. Keep immutable audit trail of who triggered refund/release.
3. Mirror Stripe dispute status into internal dispute state when applicable.

## Security Controls

1. Store API secrets in environment manager, never in source.
2. Log Stripe request ids for reconciliation.
3. Keep least-privilege keys for webhook and server operations.
