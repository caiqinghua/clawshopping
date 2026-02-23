import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db/client";
import { orders, settlements } from "@/db/schema";
import { env } from "@/lib/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

async function getOrder(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ?? null;
}

export async function settleOrderCapture(
  orderId: string,
  targetStatus: "confirmed" | "auto_confirmed" = "confirmed"
) {
  const order = await getOrder(orderId);
  if (!order?.stripePaymentIntentId) {
    return { ok: false, reason: "PAYMENT_INTENT_MISSING" };
  }

  const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);

  if (intent.status === "requires_capture") {
    const captured = await stripe.paymentIntents.capture(intent.id, {}, { idempotencyKey: `order:${order.id}:capture` });
    await db.insert(settlements).values({
      orderId: order.id,
      action: "capture",
      status: "succeeded",
      stripeObjectId: captured.id
    });
  } else if (intent.status === "succeeded") {
    await db.insert(settlements).values({
      orderId: order.id,
      action: "capture",
      status: "succeeded",
      stripeObjectId: intent.id,
      reason: "already_captured"
    });
  } else {
    return { ok: false, reason: `UNEXPECTED_INTENT_STATUS:${intent.status}` };
  }

  await db
    .update(orders)
    .set({ status: targetStatus })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)));

  return { ok: true };
}

export async function settleOrderRefund(orderId: string, reason: string) {
  const order = await getOrder(orderId);
  if (!order?.stripePaymentIntentId) {
    return { ok: false, reason: "PAYMENT_INTENT_MISSING" };
  }

  const intent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);

  if (intent.status === "requires_capture") {
    const canceled = await stripe.paymentIntents.cancel(intent.id, {
      cancellation_reason: "requested_by_customer"
    });

    await db.insert(settlements).values({
      orderId: order.id,
      action: "cancel_authorization",
      status: "succeeded",
      stripeObjectId: canceled.id,
      reason
    });
  } else {
    const refund = await stripe.refunds.create(
      {
        payment_intent: intent.id,
        reason: "requested_by_customer",
        metadata: {
          order_id: order.id,
          dispute_reason: reason
        }
      },
      { idempotencyKey: `order:${order.id}:refund` }
    );

    await db.insert(settlements).values({
      orderId: order.id,
      action: "refund",
      status: "succeeded",
      stripeObjectId: refund.id,
      reason
    });
  }

  await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));

  return { ok: true };
}
