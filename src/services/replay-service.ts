import { eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { authNonces } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";

export async function assertAndStoreNonce(input: {
  agentId: string;
  timestampSec: number;
  nonce: string;
  maxSkewSeconds: number;
}) {
  await db.delete(authNonces).where(lt(authNonces.expiresAt, new Date()));

  const nonceHash = sha256Hex(`${input.agentId}:${input.timestampSec}:${input.nonce}`);
  const exists = await db.select().from(authNonces).where(eq(authNonces.nonceHash, nonceHash)).limit(1);

  if (exists.length > 0) {
    return false;
  }

  const expiresAt = new Date((input.timestampSec + input.maxSkewSeconds) * 1000);
  await db.insert(authNonces).values({
    agentId: input.agentId,
    nonceHash,
    expiresAt
  });

  return true;
}
