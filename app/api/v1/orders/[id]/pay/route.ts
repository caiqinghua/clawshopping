import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { db } from "@/db/client";
import { orders, sellers } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";
import { env } from "@/lib/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const paySchema = z.object({
  payment_method_id: z.string().min(3).optional(),
  mit_preferred: z.boolean().optional().default(true)
});

function isPaidStatus(status: Stripe.PaymentIntent.Status) {
  return status === "requires_capture" || status === "succeeded";
}

function toHumanAssist(orderId: string, pi: Stripe.PaymentIntent | null, reason: string) {
  const nextActionUrl =
    pi?.next_action?.type === "redirect_to_url" ? pi.next_action.redirect_to_url?.url ?? null : null;

  return {
    required: true,
    reason,
    payment_intent_id: pi?.id ?? null,
    client_secret: pi?.client_secret ?? null,
    status: pi?.status ?? "unknown",
    next_action_type: pi?.next_action?.type ?? null,
    next_action_url: nextActionUrl,
    stripe_dashboard_url: pi ? `https://dashboard.stripe.com/test/payments/${pi.id}` : null,
    message_template:
      `Order ${orderId} payment needs your help due to Stripe risk/authentication checks. ` +
      `Please complete the payment authentication flow and return control to your OpenClaw agent.`
  };
}

function checkoutUrls(request: Request, orderId: string) {
  const origin = env.CLAWSHOP_BASE_URL ?? new URL(request.url).origin;
  return {
    successUrl: `${origin}/payment/return?order_id=${orderId}&payment=success`,
    cancelUrl: `${origin}/payment/return?order_id=${orderId}&payment=cancelled`
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const buyer = await requireAgent(request);
  if (!buyer) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = paySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid payment payload", 422);
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
    if (order.status === "created" && isPaidStatus(existing.status)) {
      await db.update(orders).set({ status: "paid" }).where(and(eq(orders.id, order.id), eq(orders.status, "created")));
    }

    const humanAssist =
      existing.status === "requires_action"
        ? toHumanAssist(order.id, existing, "RISK_OR_AUTH_REQUIRED")
        : existing.status === "requires_payment_method"
          ? toHumanAssist(order.id, existing, "PAYMENT_METHOD_REQUIRED")
          : null;

    return ok({
      success: true,
      payment_intent_id: existing.id,
      client_secret: existing.client_secret,
      status: existing.status,
      mit: {
        preferred: parsed.data.mit_preferred,
        attempted: false
      },
      human_assistance: humanAssist
    });
  }

  const amountCents = Math.round(Number(order.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return fail("INVALID_AMOUNT", "Order amount is invalid", 409);
  }

  const feeAmount = Math.round((amountCents * env.PLATFORM_FEE_BPS) / 10000);

  let paymentIntent: Stripe.PaymentIntent;
  let mitAttempted = false;
  const buyerMode = buyer.buyerPaymentMode;

  const payload: Stripe.PaymentIntentCreateParams = {
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
  };

  if (buyerMode === "bootstrap_required" || buyerMode === "human_every_time") {
    const urls = checkoutUrls(request, order.id);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      metadata: {
        order_id: order.id,
        buyer_agent_id: order.buyerAgentId,
        seller_agent_id: order.sellerAgentId
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            product_data: { name: `ClawShopping Order ${order.id.slice(0, 8)}` },
            unit_amount: amountCents
          }
        }
      ],
      payment_intent_data: {
        capture_method: "manual",
        application_fee_amount: feeAmount,
        transfer_data: {
          destination: seller.stripeAccountId
        },
        metadata: {
          order_id: order.id,
          buyer_agent_id: order.buyerAgentId,
          seller_agent_id: order.sellerAgentId
        }
      }
    });

    return ok({
      success: true,
      status: "requires_human_checkout",
      mit: {
        preferred: parsed.data.mit_preferred,
        attempted: false,
        result: "human_checkout_required"
      },
      human_assistance: {
        required: true,
        reason: buyerMode === "bootstrap_required" ? "FIRST_PAYMENT_REQUIRES_HUMAN_AUTH" : "HUMAN_POLICY_ENFORCED",
        checkout_session_id: session.id,
        checkout_url: session.url,
        message_template:
          `Order ${order.id} requires human checkout approval. Open the Stripe link and finish payment authorization.`
      }
    });
  }

  if (parsed.data.mit_preferred && parsed.data.payment_method_id) {
    mitAttempted = true;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          ...payload,
          payment_method: parsed.data.payment_method_id,
          confirm: true,
          off_session: true
        },
        {
          idempotencyKey: `order:${order.id}:pay:mit`
        }
      );
    } catch (error) {
      const e = error as {
        payment_intent?: Stripe.PaymentIntent;
        raw?: { payment_intent?: Stripe.PaymentIntent; code?: string; message?: string };
        code?: string;
        message?: string;
      };
      const pi = e.payment_intent ?? e.raw?.payment_intent ?? null;
      if (pi) {
        await db.update(orders).set({ stripePaymentIntentId: pi.id }).where(eq(orders.id, order.id));
        return ok({
          success: true,
          payment_intent_id: pi.id,
          client_secret: pi.client_secret,
          status: pi.status,
          mit: {
            preferred: true,
            attempted: true,
            result: "human_assistance_required"
          },
          human_assistance: toHumanAssist(order.id, pi, e.code ?? e.raw?.code ?? "MIT_CONFIRMATION_FAILED")
        });
      }
      return fail("PAYMENT_INTENT_CREATE_FAILED", e.message ?? "Unable to create payment intent", 502);
    }
  } else {
    paymentIntent = await stripe.paymentIntents.create(payload, {
      idempotencyKey: `order:${order.id}:pay`
    });
  }

  await db.update(orders).set({ stripePaymentIntentId: paymentIntent.id }).where(eq(orders.id, order.id));

  if (isPaidStatus(paymentIntent.status)) {
    await db.update(orders).set({ status: "paid" }).where(and(eq(orders.id, order.id), eq(orders.status, "created")));
  }

  const humanAssist =
    paymentIntent.status === "requires_action"
      ? toHumanAssist(order.id, paymentIntent, "RISK_OR_AUTH_REQUIRED")
      : paymentIntent.status === "requires_payment_method"
        ? toHumanAssist(
            order.id,
            paymentIntent,
            parsed.data.payment_method_id ? "PAYMENT_RETRY_REQUIRED" : "PAYMENT_METHOD_REQUIRED"
          )
        : null;

  return ok({
    success: true,
    payment_intent_id: paymentIntent.id,
    client_secret: paymentIntent.client_secret,
    status: paymentIntent.status,
    mit: {
      preferred: parsed.data.mit_preferred,
      attempted: mitAttempted,
      result: mitAttempted ? (humanAssist ? "human_assistance_required" : "confirmed_or_authorized") : "not_attempted"
    },
    human_assistance: humanAssist
  });
}
