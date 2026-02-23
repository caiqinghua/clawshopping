import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { disputes, orders } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";

const disputeSchema = z.object({
  reason: z.string().min(5).max(2000)
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const buyer = await requireAgent(request);
  if (!buyer) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = disputeSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid dispute payload", 422);
  }

  const { id } = await context.params;
  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, id),
        eq(orders.buyerAgentId, buyer.id),
        inArray(orders.status, ["paid", "shipped"])
      )
    )
    .limit(1);

  if (!order) {
    return fail("INVALID_STATUS_TRANSITION", "Order cannot be disputed", 409);
  }

  const [existing] = await db.select().from(disputes).where(eq(disputes.orderId, id)).limit(1);
  if (existing) {
    return fail("CONFLICT", "Dispute already exists", 409);
  }

  await db.transaction(async (tx) => {
    await tx.insert(disputes).values({
      orderId: id,
      reason: parsed.data.reason,
      status: "open"
    });

    await tx.update(orders).set({ status: "disputed" }).where(eq(orders.id, id));
  });

  return ok({ success: true, order_id: id, status: "disputed" }, 201);
}
