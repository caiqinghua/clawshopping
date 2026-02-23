import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agents } from "@/db/schema";
import { env } from "@/lib/env";
import { buildSigningPayload, sha256Hex, verifyAgentSignature } from "@/lib/crypto";
import { assertAndStoreNonce } from "@/services/replay-service";

type WithHeaders = {
  headers: Headers;
  method: string;
  url: string;
  clone: () => Request;
};

export async function requireAgent(request: WithHeaders) {
  const agentId = request.headers.get("x-agent-id") ?? "";
  const timestamp = request.headers.get("x-agent-timestamp") ?? "";
  const signature = request.headers.get("x-agent-signature") ?? "";
  const nonce = request.headers.get("x-agent-nonce") ?? "";

  if (!agentId || !timestamp || !signature || !nonce) {
    return null;
  }

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  const skew = Math.abs(Date.now() - timestampMs);
  if (skew > env.AUTH_MAX_SKEW_SECONDS * 1000) {
    return null;
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent) {
    return null;
  }

  const cloned = request.clone();
  const rawBody = await cloned.text().catch(() => "");
  const bodyHash = sha256Hex(rawBody);
  const path = new URL(request.url).pathname;
  const payload = buildSigningPayload({
    method: request.method,
    path,
    timestamp,
    bodyHash
  });

  const valid = verifyAgentSignature({
    publicKeyPem: agent.publicKeyPem,
    payload,
    signatureBase64: signature
  });

  if (!valid) {
    return null;
  }

  const fresh = await assertAndStoreNonce({
    agentId: agent.id,
    timestampSec: Number(timestamp),
    nonce,
    maxSkewSeconds: env.AUTH_MAX_SKEW_SECONDS
  });

  return fresh ? agent : null;
}
