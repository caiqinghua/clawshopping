import { fail, ok } from "@/lib/api";
import { requireCron } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { listPendingXClaims, markClaimVerified, markExpiredClaims } from "@/services/claim-service";
import { verifyClaimsByXBatch } from "@/services/x-verifier-service";

export async function POST(request: Request) {
  if (!requireCron(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid cron token", 401);
  }

  await markExpiredClaims();
  const claims = await listPendingXClaims(100);
  let verified = 0;
  let checked = 0;
  const debug = new URL(request.url).searchParams.get("debug") === "1";
  const details: Array<{
    claim_token: string;
    code: string;
    x_handle: string | null;
    matched: boolean;
    reason: string | null;
  }> = [];
  const verification = await verifyClaimsByXBatch({
    claims,
    windowMinutes: env.X_CLAIM_POLL_WINDOW_MINUTES
  });
  checked = verification.length;

  for (const item of verification) {
    if (item.matched) {
      await markClaimVerified(item.claimId);
      verified += 1;
    }

    if (debug) {
      const claim = claims.find((c) => c.id === item.claimId);
      details.push({
        claim_token: item.claimToken,
        code: item.code,
        x_handle: claim?.xHandle ?? null,
        matched: item.matched,
        reason: item.reason
      });
    }
  }

  return ok({
    success: true,
    checked,
    verified,
    ...(debug ? { details } : {})
  });
}
