import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { addresses } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const { id } = await context.params;
  const deleted = await db
    .delete(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.agentId, agent.id)))
    .returning({ id: addresses.id });

  if (deleted.length === 0) {
    return fail("NOT_FOUND", "Address not found", 404);
  }

  return ok({ success: true, id: deleted[0].id });
}
