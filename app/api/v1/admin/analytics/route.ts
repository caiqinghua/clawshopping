import { fail, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/admin-auth";
import { getTrafficStats } from "@/services/analytics-service";

export async function GET(request: Request) {
  if (!requireAdmin(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid admin token", 401);
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "30", 10);

  const stats = await getTrafficStats(days);
  return ok(stats);
}
