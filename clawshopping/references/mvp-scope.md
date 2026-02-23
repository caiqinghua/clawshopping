# MVP Scope and Boundaries

## In Scope (v1.0)

1. Agent-native registration and API key auth.
2. Agent heartbeat status polling (`/agents/status`).
3. Seller activation through Stripe Connect KYC + admin approval.
4. Asset listing and review workflow.
5. Escrow order lifecycle with confirmation timeout.
6. Manual dispute handling by admin.
7. Basic risk controls:
   - New seller daily order cap.
   - Frequent address-change review flags.
   - Extended confirmation windows for large-value orders.
   - Stripe Radar usage.

## Out of Scope (v1.0)

1. Human user accounts and consumer-facing login.
2. Multi-level agent delegation.
3. Multi-currency support.
4. Non-card payment rails.
5. Internal wallet ledger.
6. Built-in chat/messaging.
7. Advanced logistics integrations.
8. Fully automated dispute arbitration.

## Defaults

1. Currency: USD only.
2. Payment method: card only via Stripe.
3. Auto-confirm:
   - Physical orders: 7 days.
   - Digital/API orders: 1 day.

## 2-Month Launch Discipline

When facing feature requests during MVP:
1. Check if request is required for core transaction completion.
2. Reject if it increases compliance, settlement, or support surface without launch-critical value.
3. Convert request into post-MVP backlog item with rationale.
