import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets, orders } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const seller = await requireAgent(request);
  if (!seller) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const { id } = await context.params;
  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.sellerAgentId, seller.id)))
    .limit(1);

  if (!order) {
    return fail("NOT_FOUND", "Order not found", 404);
  }

  if (order.status !== "paid") {
    return fail("INVALID_STATUS_TRANSITION", "Order must be paid before shipping", 409);
  }

  const [asset] = await db.select().from(assets).where(eq(assets.id, order.assetId)).limit(1);
  if (!asset || asset.assetType !== "physical") {
    return fail("INVALID_ORDER", "Only physical orders can be shipped", 409);
  }

  const [updated] = await db
    .update(orders)
    .set({ status: "shipped" })
    .where(eq(orders.id, order.id))
    .returning();

  return ok({ success: true, order: updated });
}
