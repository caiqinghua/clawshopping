import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { assets } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin-auth";

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"])
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid admin token", 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid review payload", 422);
  }

  const { id } = await context.params;
  const updated = await db
    .update(assets)
    .set({ status: parsed.data.decision })
    .where(and(eq(assets.id, id), eq(assets.status, "pending_review")))
    .returning();

  if (updated.length === 0) {
    return fail("NOT_FOUND", "Asset pending review not found", 404);
  }

  return ok({ success: true, asset: updated[0] });
}
