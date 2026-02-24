import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { agentClaims, agents } from "@/db/schema";
import { randomTokenHex, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";

type DbLike = typeof db;
type InsertLike = Pick<DbLike, "insert">;
export type XCopyVariant = "tech" | "product";

export function chooseXCopyVariant(verificationCode: string): XCopyVariant {
  const h = sha256Hex(verificationCode);
  const lastHex = h[h.length - 1] ?? "0";
  const n = parseInt(lastHex, 16);
  return n % 2 === 0 ? "tech" : "product";
}

export function buildXIntentText(verificationCode: string, variant: XCopyVariant) {
  if (variant === "tech") {
    return [
      "I just activated my AI Agent identity on @ClawShopping.",
      "Shipping Agent-to-Agent commerce infra with escrow + verification.",
      `${verificationCode}`,
      "",
      "#ClawShopping #AIAgents #AgentCommerce"
    ].join("\n");
  }

  return [
    "My AI Agent just joined @ClawShopping.",
    "This is what the next marketplace era looks like.",
    `${verificationCode}`,
    "",
    "#ClawShopping #AIAgents #AgentCommerce"
  ].join("\n");
}

export function buildXIntentUrl(verificationCode: string, variant?: XCopyVariant) {
  const selected = variant ?? chooseXCopyVariant(verificationCode);
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", buildXIntentText(verificationCode, selected));
  return url.toString();
}

function generateVerificationCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const segment = () =>
    Array.from({ length: 4 })
      .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
      .join("");
  return `claw-${segment()}-${segment()}`;
}

export async function createClaimForAgent(agentId: string, dbLike: InsertLike = db) {
  const claimToken = `claim_${randomTokenHex(16)}`;
  const verificationCode = generateVerificationCode();

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + env.X_CLAIM_CHALLENGE_TTL_HOURS);

  const [claim] = await dbLike
    .insert(agentClaims)
    .values({
      agentId,
      claimToken,
      verificationCode,
      status: "pending",
      expiresAt
    })
    .returning();

  const base = env.CLAWSHOP_BASE_URL ?? "http://localhost:3000";
  const variant = chooseXCopyVariant(claim.verificationCode);
  return {
    ...claim,
    claimUrl: `${base}/claim/${claim.claimToken}`,
    xPostUrl: buildXIntentUrl(claim.verificationCode, variant),
    xCopyVariant: variant
  };
}

export async function startClaimWithXHandle(input: { claimToken: string; xHandle: string }) {
  const handle = input.xHandle.replace(/^@+/, "").trim().toLowerCase();
  const now = new Date();

  const [updated] = await db
    .update(agentClaims)
    .set({
      xHandle: handle,
      status: "pending"
    })
    .where(and(eq(agentClaims.claimToken, input.claimToken), eq(agentClaims.status, "pending"), gt(agentClaims.expiresAt, now)))
    .returning();

  return updated ?? null;
}

export async function getClaimByToken(claimToken: string) {
  const [claim] = await db.select().from(agentClaims).where(eq(agentClaims.claimToken, claimToken)).limit(1);
  return claim ?? null;
}

export async function markClaimVerified(claimId: string) {
  const now = new Date();
  const [claim] = await db
    .update(agentClaims)
    .set({ status: "verified", verifiedAt: now })
    .where(and(eq(agentClaims.id, claimId), eq(agentClaims.status, "pending")))
    .returning();

  if (!claim) return null;

  await db.update(agents).set({ xClaimVerifiedAt: now }).where(eq(agents.id, claim.agentId));
  return claim;
}

export async function markExpiredClaims() {
  const now = new Date();
  await db.update(agentClaims).set({ status: "expired" }).where(and(eq(agentClaims.status, "pending"), lt(agentClaims.expiresAt, now)));
}

export async function listPendingXClaims(limit = 50) {
  const now = new Date();
  return db
    .select()
    .from(agentClaims)
    .where(and(eq(agentClaims.status, "pending"), gt(agentClaims.expiresAt, now)))
    .limit(limit);
}
