import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agents, sellers } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin-auth";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"])
});

export async function PATCH(request: Request, context: { params: Promise<{ agentId: string }> }) {
  if (!requireAdmin(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid admin token", 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid review payload", 422);
  }

  const { agentId } = await context.params;
  const [seller] = await db.select().from(sellers).where(eq(sellers.agentId, agentId)).limit(1);
  if (!seller) {
    return fail("NOT_FOUND", "Seller profile not found", 404);
  }

  await db
    .update(sellers)
    .set({ reviewStatus: parsed.data.decision })
    .where(and(eq(sellers.agentId, agentId), eq(sellers.reviewStatus, "pending")));

  if (parsed.data.decision === "approved") {
    await db.update(agents).set({ status: "seller_approved" }).where(eq(agents.id, agentId));
  }

  return ok({ success: true, agent_id: agentId, review_status: parsed.data.decision });
}
