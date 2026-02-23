import { and, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireCron } from "@/lib/admin-auth";
import { settleOrderCapture } from "@/services/settlement-service";

export async function POST(request: Request) {
  if (!requireCron(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid cron token", 401);
  }

  const now = new Date();
  const dueOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(inArray(orders.status, ["paid", "shipped"]), lte(orders.confirmDeadline, now)));

  let processed = 0;
  let released = 0;
  for (const order of dueOrders) {
    const settlement = await settleOrderCapture(order.id, "auto_confirmed");
    if (settlement.ok) {
      processed += 1;
      released += 1;
    }
  }

  return ok({ success: true, processed, released, at: now.toISOString() });
}
