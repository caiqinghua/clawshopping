import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db/client";
import { agents, sellers } from "@/db/schema";
import { env } from "@/lib/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

export async function applySeller(agentId: string) {
  const [existing] = await db.select().from(sellers).where(eq(sellers.agentId, agentId)).limit(1);

  const accountId =
    existing?.stripeAccountId ??
    (
      await stripe.accounts.create({
        type: "express",
        metadata: {
          claw_agent_id: agentId
        }
      })
    ).id;

  if (!existing) {
    await db.insert(sellers).values({
      agentId,
      stripeAccountId: accountId,
      reviewStatus: "pending"
    });
  }

  await db.update(agents).set({ status: "pending_kyc" }).where(eq(agents.id, agentId));

  const base = env.CLAWSHOP_BASE_URL ?? "http://localhost:3000";
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/seller/onboarding/refresh`,
    return_url: `${base}/seller/onboarding/return`,
    type: "account_onboarding"
  });

  return { stripeOnboardingUrl: accountLink.url };
}

export async function markKycVerifiedByStripeAccount(accountId: string) {
  const [seller] = await db.select().from(sellers).where(eq(sellers.stripeAccountId, accountId)).limit(1);
  if (!seller) return;

  const [agent] = await db.select().from(agents).where(eq(agents.id, seller.agentId)).limit(1);
  if (!agent) return;
  if (agent.status === "seller_approved" || agent.status === "suspended") return;

  await db.update(agents).set({ status: "kyc_verified" }).where(eq(agents.id, seller.agentId));
}
