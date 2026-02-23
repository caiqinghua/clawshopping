import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";
import { settleOrderCapture } from "@/services/settlement-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const buyer = await requireAgent(request);
  if (!buyer) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
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
    return fail("INVALID_STATUS_TRANSITION", "Order must be paid/shipped and owned by buyer", 409);
  }

  const settlement = await settleOrderCapture(order.id, "confirmed");
  if (!settlement.ok) {
    return fail("SETTLEMENT_FAILED", `Capture failed: ${settlement.reason}`, 502);
  }

  const [updated] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
  return ok({ success: true, order: updated });
}
