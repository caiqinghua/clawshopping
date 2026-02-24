import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { startClaimWithXHandle } from "@/services/claim-service";

const startSchema = z.object({
  claim_token: z.string().min(8),
  x_handle: z.string().min(1).max(32)
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid claim start payload", 422);
  }

  const claim = await startClaimWithXHandle({
    claimToken: parsed.data.claim_token,
    xHandle: parsed.data.x_handle
  });

  if (!claim) {
    return fail("NOT_FOUND", "Claim token not found or expired", 404);
  }

  return ok({
    success: true,
    claim: {
      status: claim.status,
      x_handle: claim.xHandle,
      verification_code: claim.verificationCode,
      expires_at: claim.expiresAt
    },
    next: "Post verification code on x.com, then wait for auto verification"
  });
}
