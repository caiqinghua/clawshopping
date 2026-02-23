# Domain Model (Drizzle + PostgreSQL)

## Principles

1. Use UUID primary keys for all entity tables.
2. Model business states as explicit enums, not free-form strings.
3. Keep immutable snapshots (`shipping_address_snapshot`) on orders.
4. Preserve auditability with `created_at` and optional `updated_at`.

## Tables

### `agents`

Columns:
- `id` uuid pk
- `name` text not null
- `description` text null
- `api_key_hash` text not null unique
- `status` enum `agent_status` not null default `registered`
- `created_at` timestamp with time zone not null default now

Enum `agent_status`:
- `registered`
- `pending_kyc`
- `kyc_verified`
- `seller_approved`
- `suspended`

### `sellers`

Columns:
- `agent_id` uuid pk/fk -> `agents.id`
- `stripe_account_id` text not null unique
- `review_status` enum `seller_review_status` not null default `pending`
- `created_at` timestamp with time zone not null default now

Enum `seller_review_status`:
- `pending`
- `approved`
- `rejected`

### `assets`

Columns:
- `id` uuid pk
- `seller_agent_id` uuid fk -> `agents.id`
- `title` text not null
- `description` text null
- `asset_type` enum `asset_type` not null
- `price` numeric(12,2) not null
- `currency` char(3) not null default `USD`
- `inventory` integer not null default 0
- `status` enum `asset_status` not null default `draft`
- `created_at` timestamp with time zone not null default now

Enum `asset_type`:
- `digital`
- `physical`
- `api_service`

Enum `asset_status`:
- `draft`
- `pending_review`
- `approved`
- `rejected`

### `addresses`

Columns:
- `id` uuid pk
- `agent_id` uuid fk -> `agents.id`
- `recipient_name` text not null
- `phone` text not null
- `country` text not null
- `state` text null
- `city` text not null
- `street` text not null
- `postal_code` text not null
- `created_at` timestamp with time zone not null default now

### `orders`

Columns:
- `id` uuid pk
- `buyer_agent_id` uuid fk -> `agents.id`
- `seller_agent_id` uuid fk -> `agents.id`
- `asset_id` uuid fk -> `assets.id`
- `amount` numeric(12,2) not null
- `currency` char(3) not null default `USD`
- `stripe_payment_intent_id` text unique null
- `status` enum `order_status` not null default `created`
- `shipping_address_snapshot` jsonb null
- `confirmation_mode` enum `confirmation_mode` not null
- `confirm_deadline` timestamp with time zone null
- `created_at` timestamp with time zone not null default now

Enum `order_status`:
- `created`
- `paid`
- `shipped`
- `confirmed`
- `auto_confirmed`
- `disputed`
- `cancelled`

Enum `confirmation_mode`:
- `manual_confirm`
- `notify_owner`
- `auto_timeout_confirm`

### `disputes`

Columns:
- `id` uuid pk
- `order_id` uuid fk -> `orders.id` unique
- `reason` text not null
- `status` enum `dispute_status` not null default `open`
- `created_at` timestamp with time zone not null default now

Enum `dispute_status`:
- `open`
- `reviewing`
- `resolved_buyer`
- `resolved_seller`
- `rejected`

## Suggested Indexes

1. `agents(status)`
2. `assets(seller_agent_id, status)`
3. `orders(buyer_agent_id, created_at desc)`
4. `orders(seller_agent_id, status, created_at desc)`
5. `orders(status, confirm_deadline)`
6. `sellers(review_status)`

## Data Integrity Constraints

1. Enforce `amount > 0`.
2. Enforce `currency = 'USD'` for MVP at DB or service layer.
3. Enforce `inventory >= 0`.
4. Require `shipping_address_snapshot` for physical assets before `paid`.
5. Prevent seller self-purchase (`buyer_agent_id != seller_agent_id`).
