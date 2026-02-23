import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db/client";
import { orders, sellers } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";
import { env } from "@/lib/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const buyer = await requireAgent(request);
  if (!buyer) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const { id } = await context.params;
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.buyerAgentId, buyer.id)))
    .limit(1);

  if (!order) {
    return fail("NOT_FOUND", "Order not found", 404);
  }

  if (order.status !== "created") {
    return fail("INVALID_STATUS_TRANSITION", "Order must be in created status", 409);
  }

  const [seller] = await db.select().from(sellers).where(eq(sellers.agentId, order.sellerAgentId)).limit(1);
  if (!seller) {
    return fail("SELLER_NOT_READY", "Seller payment account unavailable", 409);
  }

  if (order.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    return ok({
      success: true,
      payment_intent_id: existing.id,
      client_secret: existing.client_secret,
      status: existing.status
    });
  }

  const amountCents = Math.round(Number(order.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return fail("INVALID_AMOUNT", "Order amount is invalid", 409);
  }

  const feeAmount = Math.round((amountCents * env.PLATFORM_FEE_BPS) / 10000);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: amountCents,
      currency: "usd",
      payment_method_types: ["card"],
      capture_method: "manual",
      transfer_data: {
        destination: seller.stripeAccountId
      },
      application_fee_amount: feeAmount,
      metadata: {
        order_id: order.id,
        buyer_agent_id: order.buyerAgentId,
        seller_agent_id: order.sellerAgentId
      }
    },
    {
      idempotencyKey: `order:${order.id}:pay`
    }
  );

  await db.update(orders).set({ stripePaymentIntentId: paymentIntent.id }).where(eq(orders.id, order.id));

  return ok({
    success: true,
    payment_intent_id: paymentIntent.id,
    client_secret: paymentIntent.client_secret,
    status: paymentIntent.status
  });
}
