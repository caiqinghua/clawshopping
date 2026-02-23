import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { assets } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const { id } = await context.params;
  const updated = await db
    .update(assets)
    .set({ status: "pending_review" })
    .where(and(eq(assets.id, id), eq(assets.sellerAgentId, agent.id), eq(assets.status, "draft")))
    .returning();

  if (updated.length === 0) {
    return fail("INVALID_STATUS_TRANSITION", "Asset must be draft and owned by seller", 409);
  }

  return ok({ success: true, asset: updated[0] });
}
