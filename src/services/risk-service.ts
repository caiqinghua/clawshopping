import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { agents, riskCounters } from "@/db/schema";

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function bumpCounter(counterKey: string, expiresAt: Date) {
  const [row] = await db.select().from(riskCounters).where(eq(riskCounters.counterKey, counterKey)).limit(1);

  if (!row) {
    await db.insert(riskCounters).values({ counterKey, count: 1, expiresAt });
    return 1;
  }

  if (row.expiresAt < new Date()) {
    await db
      .update(riskCounters)
      .set({ count: 1, expiresAt })
      .where(eq(riskCounters.counterKey, counterKey));
    return 1;
  }

  const [updated] = await db
    .update(riskCounters)
    .set({ count: row.count + 1 })
    .where(eq(riskCounters.counterKey, counterKey))
    .returning({ count: riskCounters.count });

  return updated?.count ?? row.count + 1;
}

export async function checkNewSellerDailyLimit(input: {
  sellerAgentId: string;
  windowDays: number;
  dailyLimit: number;
}) {
  const cutoff = new Date(Date.now() - input.windowDays * 24 * 60 * 60 * 1000);
  const [sellerAgent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, input.sellerAgentId), gte(agents.createdAt, cutoff)))
    .limit(1);

  if (!sellerAgent) {
    return { allowed: true, count: 0, reason: null as string | null };
  }

  const key = `seller_daily_orders:${input.sellerAgentId}:${dayKey()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const count = await bumpCounter(key, expiresAt);

  if (count > input.dailyLimit) {
    return { allowed: false, count, reason: "NEW_SELLER_DAILY_LIMIT" };
  }

  return { allowed: true, count, reason: null as string | null };
}

export async function recordAddressChurn(input: {
  agentId: string;
  dailyLimit: number;
}) {
  const key = `address_churn:${input.agentId}:${dayKey()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const count = await bumpCounter(key, expiresAt);

  return {
    count,
    requiresManualReview: count > input.dailyLimit
  };
}
