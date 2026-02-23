import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { disputes } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: Request) {
  if (!requireAdmin(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid admin token", 401);
  }

  const rows = await db.select().from(disputes).orderBy(desc(disputes.createdAt));
  return ok({ disputes: rows });
}
