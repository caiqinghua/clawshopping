import { fail, ok } from "@/lib/api";
import { requireCron } from "@/lib/admin-auth";
import { env } from "@/lib/env";
import { listPendingXClaims, markClaimVerified, markExpiredClaims } from "@/services/claim-service";
import { hasVerificationPost } from "@/services/x-verifier-service";

export async function POST(request: Request) {
  if (!requireCron(request.headers)) {
    return fail("UNAUTHORIZED", "Invalid cron token", 401);
  }

  await markExpiredClaims();
  const claims = await listPendingXClaims(100);
  let verified = 0;
  let checked = 0;

  for (const claim of claims) {
    checked += 1;

    const result = await hasVerificationPost({
      xHandle: claim.xHandle,
      verificationCode: claim.verificationCode,
      windowMinutes: env.X_CLAIM_POLL_WINDOW_MINUTES
    });

    if (result.matched) {
      await markClaimVerified(claim.id);
      verified += 1;
    }
  }

  return ok({ success: true, checked, verified });
}
