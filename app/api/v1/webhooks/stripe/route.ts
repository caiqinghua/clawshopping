import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db/client";
import { agents, disputes, orders, stripeWebhookEvents } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { env } from "@/lib/env";
import { markKycVerifiedByStripeAccount } from "@/services/seller-service";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return fail("INVALID_SIGNATURE", "Missing stripe signature", 400);
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return fail("INVALID_SIGNATURE", "Stripe signature verification failed", 400);
  }

  const [existing] = await db
    .select()
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.eventId, event.id))
    .limit(1);

  if (existing?.processed) {
    return ok({ received: true, idempotent: true });
  }

  if (!existing) {
    await db.insert(stripeWebhookEvents).values({
      eventId: event.id,
      processed: false
    });
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      if (account.charges_enabled && account.payouts_enabled) {
        await markKycVerifiedByStripeAccount(account.id);
      }
      break;
    }
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await db
        .update(orders)
        .set({ status: "confirmed" })
        .where(and(eq(orders.stripePaymentIntentId, paymentIntent.id), eq(orders.status, "paid")));
      const [order] = await db
        .select({ buyerAgentId: orders.buyerAgentId })
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
        .limit(1);
      if (order) {
        await db.update(agents).set({ buyerPaymentMode: "mit_enabled" }).where(eq(agents.id, order.buyerAgentId));
      }
      break;
    }
    case "payment_intent.amount_capturable_updated": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await db
        .update(orders)
        .set({ status: "paid" })
        .where(and(eq(orders.stripePaymentIntentId, paymentIntent.id), eq(orders.status, "created")));
      const [order] = await db
        .select({ buyerAgentId: orders.buyerAgentId })
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
        .limit(1);
      if (order) {
        await db.update(agents).set({ buyerPaymentMode: "mit_enabled" }).where(eq(agents.id, order.buyerAgentId));
      }
      break;
    }
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await db
        .update(orders)
        .set({ status: "cancelled" })
        .where(and(eq(orders.stripePaymentIntentId, paymentIntent.id), eq(orders.status, "created")));
      const [order] = await db
        .select({ buyerAgentId: orders.buyerAgentId })
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentIntent.id))
        .limit(1);
      if (order) {
        await db.update(agents).set({ buyerPaymentMode: "human_every_time" }).where(eq(agents.id, order.buyerAgentId));
      }
      break;
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
      if (!orderId || !paymentIntentId) break;

      const [order] = await db.select({ id: orders.id, buyerAgentId: orders.buyerAgentId, status: orders.status }).from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) break;

      await db
        .update(orders)
        .set({
          stripePaymentIntentId: paymentIntentId,
          status: order.status === "created" ? "paid" : order.status
        })
        .where(eq(orders.id, order.id));

      await db.update(agents).set({ buyerPaymentMode: "mit_enabled" }).where(eq(agents.id, order.buyerAgentId));
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (!orderId) break;
      const [order] = await db
        .select({ id: orders.id, buyerAgentId: orders.buyerAgentId, status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!order || order.status !== "created") break;
      await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
      await db.update(agents).set({ buyerPaymentMode: "human_every_time" }).where(eq(agents.id, order.buyerAgentId));
      break;
    }
    case "charge.dispute.created": {
      const chargeDispute = event.data.object as Stripe.Dispute;
      const paymentIntentId = typeof chargeDispute.payment_intent === "string" ? chargeDispute.payment_intent : null;
      if (!paymentIntentId) break;

      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.stripePaymentIntentId, paymentIntentId))
        .limit(1);

      if (!order) break;

      const [existingDispute] = await db
        .select()
        .from(disputes)
        .where(eq(disputes.orderId, order.id))
        .limit(1);

      if (!existingDispute) {
        await db.insert(disputes).values({
          orderId: order.id,
          reason: `stripe_dispute:${chargeDispute.reason ?? "unknown"}`,
          status: "open"
        });
      }

      await db.update(orders).set({ status: "disputed" }).where(eq(orders.id, order.id));
      break;
    }
    default:
      break;
  }

  await db
    .update(stripeWebhookEvents)
    .set({ processed: true })
    .where(eq(stripeWebhookEvents.eventId, event.id));

  return ok({ received: true });
}
