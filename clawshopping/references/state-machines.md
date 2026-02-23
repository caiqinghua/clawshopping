# State Machines

## Agent Status

Allowed transitions:
1. `registered -> pending_kyc` when seller applies.
2. `pending_kyc -> kyc_verified` when Stripe account enables charges and payouts.
3. `kyc_verified -> seller_approved` when admin review approves seller profile.
4. `* -> suspended` when risk/compliance action is required.

Capabilities:
- `registered`: can buy, cannot sell.
- `pending_kyc`: can buy, cannot sell.
- `kyc_verified`: can buy, cannot sell.
- `seller_approved`: can buy and sell.
- `suspended`: cannot buy or sell (recommended strict mode).

## Seller Review Status

Allowed transitions:
1. `pending -> approved`
2. `pending -> rejected`
3. `rejected -> pending` (optional reopen by admin)

## Asset Status

Allowed transitions:
1. `draft -> pending_review`
2. `pending_review -> approved`
3. `pending_review -> rejected`
4. `rejected -> draft` (optional seller revision)

## Order Status

Canonical flow:
`created -> paid -> shipped (physical only) -> confirmed -> auto_confirmed -> disputed -> cancelled`

Implement practical transitions as:
1. `created -> paid` on successful payment.
2. `created -> cancelled` on explicit cancel before payment or payment expiry.
3. `paid -> shipped` for physical goods.
4. `paid -> confirmed` for digital/API goods or direct buyer confirm.
5. `shipped -> confirmed` on buyer confirm.
6. `paid|shipped -> auto_confirmed` when `confirm_deadline` passes.
7. `paid|shipped -> disputed` before auto-confirm/final release.
8. `disputed -> confirmed|cancelled` only by admin resolution policy.

Notes:
1. Do not allow `auto_confirmed -> disputed` unless business rules explicitly reopen.
2. Map settlement release trigger to `confirmed` and `auto_confirmed`.

## Confirmation Deadline Policy

Defaults:
1. Physical: `paid` timestamp + 7 days.
2. Digital/API: `paid` timestamp + 1 day.

Risk override:
1. Extend deadline for large-value orders.
2. Extend deadline for anomaly flags.

## Cron Jobs

Run at least every 5-15 minutes:
1. Find orders `status in (paid, shipped)` and `confirm_deadline <= now`.
2. Transition to `auto_confirmed`.
3. Trigger settlement release workflow.
4. Emit audit event.

## Dispute Workflow (MVP Manual)

1. Create dispute with `status = open`.
2. Move to `reviewing` when admin picks up.
3. Resolve as:
   - `resolved_buyer` with refund/partial refund logic.
   - `resolved_seller` with release logic.
   - `rejected` if invalid claim.
