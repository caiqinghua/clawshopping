import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";
import { applySeller } from "@/services/seller-service";

export async function POST(request: Request) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  if (agent.status === "suspended") {
    return fail("AGENT_SUSPENDED", "Suspended agent cannot apply as seller", 403);
  }

  const result = await applySeller(agent.id);
  return ok({
    stripe_onboarding_url: result.stripeOnboardingUrl
  });
}
