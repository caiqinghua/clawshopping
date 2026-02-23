import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agents } from "@/db/schema";
import { generateAgentKeyPair } from "@/lib/crypto";

export async function registerAgent(input: { name: string; description?: string | null }) {
  const keyPair = generateAgentKeyPair();

  const [agent] = await db
    .insert(agents)
    .values({
      name: input.name,
      description: input.description ?? null,
      publicKeyPem: keyPair.publicKeyPem,
      status: "registered"
    })
    .returning({ id: agents.id, name: agents.name, status: agents.status });

  return {
    agent,
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
