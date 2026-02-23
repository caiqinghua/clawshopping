import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { disputes, orders } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin-auth";
import { settleOrderCapture, settleOrderRefund } from "@/services/settlement-service";

const resolveSchema = z.object({
  decision: z.enum(["buyer", "seller", "reject"]),
  reason: z.string().min(3).max(1000)
});

export async function PATCH(request: Request, context: { params: Promise<{ orderId: string }> }) {
  if (!requireAdmin(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid admin token", 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = resolveSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid resolution payload", 422);
  }

  const { orderId } = await context.params;
  const [dispute] = await db.select().from(disputes).where(eq(disputes.orderId, orderId)).limit(1);
  if (!dispute) {
    return fail("NOT_FOUND", "Dispute not found", 404);
  }

  if (dispute.status !== "open" && dispute.status !== "reviewing") {
    return fail("CONFLICT", "Dispute already resolved", 409);
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order || order.status !== "disputed") {
    return fail("INVALID_STATUS", "Order is not in disputed status", 409);
  }

  if (parsed.data.decision === "seller") {
    const settlement = await settleOrderCapture(orderId);
    if (!settlement.ok) {
      return fail("SETTLEMENT_FAILED", `Capture failed: ${settlement.reason}`, 502);
    }

    await db
      .update(disputes)
      .set({ status: "resolved_seller" })
      .where(and(eq(disputes.orderId, orderId), eq(disputes.status, dispute.status)));

    return ok({ success: true, order_id: orderId, dispute_status: "resolved_seller" });
  }

  if (parsed.data.decision === "buyer") {
    const settlement = await settleOrderRefund(orderId, parsed.data.reason);
    if (!settlement.ok) {
      return fail("SETTLEMENT_FAILED", `Refund failed: ${settlement.reason}`, 502);
    }

    await db
      .update(disputes)
      .set({ status: "resolved_buyer" })
      .where(and(eq(disputes.orderId, orderId), eq(disputes.status, dispute.status)));

    return ok({ success: true, order_id: orderId, dispute_status: "resolved_buyer" });
  }

  await db.transaction(async (tx) => {
    await tx.update(disputes).set({ status: "rejected" }).where(eq(disputes.orderId, orderId));
    await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, orderId));
  });

  return ok({ success: true, order_id: orderId, dispute_status: "rejected" });
}
