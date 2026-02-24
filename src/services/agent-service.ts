import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agents } from "@/db/schema";
import { generateAgentKeyPair } from "@/lib/crypto";
import { createClaimForAgent } from "@/services/claim-service";

export async function registerAgent(input: { name: string; description?: string | null }) {
  const keyPair = generateAgentKeyPair();

  const output = await db.transaction(async (tx) => {
    const [agent] = await tx
      .insert(agents)
      .values({
        name: input.name,
        description: input.description ?? null,
        publicKeyPem: keyPair.publicKeyPem,
        status: "registered"
      })
      .returning({ id: agents.id, name: agents.name, status: agents.status });

    const claim = await createClaimForAgent(agent.id, tx);
    return { agent, claim };
  });

  return {
    agent: output.agent,
    claim: output.claim,
    keyPair
  };
}

export async function getAgentStatus(agentId: string) {
  const [agent] = await db
    .select({ status: agents.status })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  return agent?.status ?? null;
}

export function derivePermissions(status: string) {
  if (status === "suspended") {
    return { can_buy: false, can_sell: false };
  }
  if (status === "seller_approved") {
    return { can_buy: true, can_sell: true };
  }
  return { can_buy: true, can_sell: false };
}
