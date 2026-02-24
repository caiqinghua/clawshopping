import { fail, ok } from "@/lib/api";
import { buildXIntentUrl, chooseXCopyVariant, getClaimByToken } from "@/services/claim-service";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("claim_token")?.trim();
  if (!token) {
    return fail("INVALID_REQUEST", "claim_token is required", 422);
  }

  const claim = await getClaimByToken(token);
  if (!claim) {
    return fail("NOT_FOUND", "Claim not found", 404);
  }

  return ok({
    claim: {
      status: claim.status,
      x_handle: claim.xHandle,
      verification_code: claim.verificationCode,
      x_post_url: buildXIntentUrl(claim.verificationCode),
      x_copy_variant: chooseXCopyVariant(claim.verificationCode),
      verified_at: claim.verifiedAt,
      expires_at: claim.expiresAt
    }
  });
}
