import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";
import { derivePermissions } from "@/services/agent-service";

export async function GET(request: Request) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const perms = derivePermissions(agent.status);
  return ok({
    status: agent.status,
    x_claim_verified: Boolean(agent.xClaimVerifiedAt),
    ...perms
  });
}
