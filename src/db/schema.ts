import {
  boolean,
  char,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const agentStatus = pgEnum("agent_status", [
  "registered",
  "pending_kyc",
  "kyc_verified",
  "seller_approved",
  "suspended"
]);

export const sellerReviewStatus = pgEnum("seller_review_status", ["pending", "approved", "rejected"]);

export const assetType = pgEnum("asset_type", ["digital", "physical", "api_service"]);
export const assetStatus = pgEnum("asset_status", ["draft", "pending_review", "approved", "rejected"]);

export const orderStatus = pgEnum("order_status", [
  "created",
  "paid",
  "shipped",
  "confirmed",
  "auto_confirmed",
  "disputed",
  "cancelled"
]);

export const confirmationMode = pgEnum("confirmation_mode", [
  "manual_confirm",
  "notify_owner",
  "auto_timeout_confirm"
]);

export const disputeStatus = pgEnum("dispute_status", [
  "open",
  "reviewing",
  "resolved_buyer",
  "resolved_seller",
  "rejected"
]);

export const settlementAction = pgEnum("settlement_action", ["capture", "refund", "cancel_authorization"]);
export const settlementStatus = pgEnum("settlement_status", ["succeeded", "failed"]);
export const claimStatus = pgEnum("claim_status", ["pending", "verified", "expired"]);

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  publicKeyPem: text("public_key_pem").notNull(),
  status: agentStatus("status").notNull().default("registered"),
  xClaimVerifiedAt: timestamp("x_claim_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const sellers = pgTable("sellers", {
  agentId: uuid("agent_id")
    .primaryKey()
    .references(() => agents.id, { onDelete: "cascade" }),
  stripeAccountId: text("stripe_account_id").notNull().unique(),
  reviewStatus: sellerReviewStatus("review_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  sellerAgentId: uuid("seller_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  assetType: assetType("asset_type").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  inventory: integer("inventory").notNull().default(0),
  status: assetStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const addresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  recipientName: text("recipient_name").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  state: text("state"),
  city: text("city").notNull(),
  street: text("street").notNull(),
  postalCode: text("postal_code").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyerAgentId: uuid("buyer_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "restrict" }),
  sellerAgentId: uuid("seller_agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  status: orderStatus("status").notNull().default("created"),
  shippingAddressSnapshot: jsonb("shipping_address_snapshot"),
  confirmationMode: confirmationMode("confirmation_mode").notNull(),
  confirmDeadline: timestamp("confirm_deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  status: disputeStatus("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventId: text("event_id").notNull().unique(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
});

export const authNonces = pgTable("auth_nonces", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  nonceHash: text("nonce_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const riskCounters = pgTable("risk_counters", {
  id: uuid("id").defaultRandom().primaryKey(),
  counterKey: text("counter_key").notNull().unique(),
  count: integer("count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
});

export const settlements = pgTable("settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  action: settlementAction("action").notNull(),
  status: settlementStatus("status").notNull(),
  stripeObjectId: text("stripe_object_id"),
  stripeBalanceTransactionId: text("stripe_balance_transaction_id"),
  currency: char("currency", { length: 3 }),
  grossAmountCents: integer("gross_amount_cents"),
  stripeFeeAmountCents: integer("stripe_fee_amount_cents"),
  platformFeeAmountCents: integer("platform_fee_amount_cents"),
  sellerTransferAmountCents: integer("seller_transfer_amount_cents"),
  netAmountCents: integer("net_amount_cents"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const agentClaims = pgTable("agent_claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .unique()
    .references(() => agents.id, { onDelete: "cascade" }),
  claimToken: text("claim_token").notNull().unique(),
  verificationCode: text("verification_code").notNull().unique(),
  xHandle: text("x_handle"),
  status: claimStatus("status").notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
