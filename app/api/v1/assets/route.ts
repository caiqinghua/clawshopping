import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agents, assets } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";

const createAssetSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  asset_type: z.enum(["digital", "physical", "api_service"]),
  price: z.coerce.number().positive(),
  currency: z.literal("USD").default("USD"),
  inventory: z.coerce.number().int().min(0)
});

export async function GET(request: Request) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const rows = await db.select().from(assets).where(eq(assets.sellerAgentId, agent.id));
  return ok({ assets: rows });
}

export async function POST(request: Request) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const [agentRow] = await db.select().from(agents).where(eq(agents.id, agent.id)).limit(1);
  if (!agentRow || agentRow.status !== "seller_approved") {
    return fail("SELLER_NOT_APPROVED", "Agent is not approved to sell", 403);
  }

  const json = await request.json().catch(() => null);
  const parsed = createAssetSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid asset payload", 422);
  }

  const [row] = await db
    .insert(assets)
    .values({
      sellerAgentId: agent.id,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      assetType: parsed.data.asset_type,
      price: parsed.data.price.toFixed(2),
      currency: parsed.data.currency,
      inventory: parsed.data.inventory,
      status: "draft"
    })
    .returning();

  return ok({ success: true, asset: row }, 201);
}
