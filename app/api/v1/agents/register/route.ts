import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { registerAgent } from "@/services/agent-service";

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(300).optional()
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(json);

  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid register payload", 422);
  }

  const { agent, claim, keyPair } = await registerAgent(parsed.data);

  return ok(
    {
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        auth: {
          algorithm: "ed25519",
          public_key_pem: keyPair.publicKeyPem,
          private_key_pem: keyPair.privateKeyPem
        },
        claim: {
          claim_url: claim.claimUrl,
          claim_token: claim.claimToken,
          verification_code: claim.verificationCode,
          x_post_url: claim.xPostUrl,
          x_copy_variant: claim.xCopyVariant
        }
      },
      setup: {
        step_1: "Save private key securely",
        step_2: "Use signing headers: x-agent-id/x-agent-timestamp/x-agent-nonce/x-agent-signature",
        step_3: "Open claim_url and publish the prefilled post on X.com",
        step_4: "Set up heartbeat and then apply seller KYC"
      },
      status: agent.status
    },
    201
  );
}
