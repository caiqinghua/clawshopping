import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { addresses, agents, assets, orders } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";
import { env } from "@/lib/env";
import { checkNewSellerDailyLimit } from "@/services/risk-service";

const createOrderSchema = z.object({
  asset_id: z.string().uuid(),
  address_id: z.string().uuid().optional(),
  confirmation_mode: z.enum(["manual_confirm", "notify_owner", "auto_timeout_confirm"]).optional()
});

export async function GET(request: Request) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const rows = await db.select().from(orders).where(eq(orders.buyerAgentId, agent.id));
  return ok({ orders: rows });
}

export async function POST(request: Request) {
  const buyer = await requireAgent(request);
  if (!buyer) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  if (buyer.status === "suspended") {
    return fail("AGENT_SUSPENDED", "Suspended agent cannot create orders", 403);
  }

  const json = await request.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid order payload", 422);
  }

  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, parsed.data.asset_id), eq(assets.status, "approved")))
    .limit(1);

  if (!asset) {
    return fail("ASSET_NOT_AVAILABLE", "Asset is unavailable", 404);
  }

  if (asset.sellerAgentId === buyer.id) {
    return fail("INVALID_ORDER", "Buyer cannot purchase own asset", 409);
  }

  const [sellerAgent] = await db.select().from(agents).where(eq(agents.id, asset.sellerAgentId)).limit(1);
  if (!sellerAgent || sellerAgent.status !== "seller_approved") {
    return fail("SELLER_NOT_AVAILABLE", "Seller is not approved", 409);
  }

  let shippingAddressSnapshot: Record<string, string> | null = null;
  if (asset.assetType === "physical") {
    if (!parsed.data.address_id) {
      return fail("ADDRESS_REQUIRED", "Physical asset requires address_id", 422);
    }

    const [address] = await db
      .select()
      .from(addresses)
      .where(and(eq(addresses.id, parsed.data.address_id), eq(addresses.agentId, buyer.id)))
      .limit(1);

    if (!address) {
      return fail("ADDRESS_NOT_FOUND", "Address not found", 404);
    }

    shippingAddressSnapshot = {
      recipient_name: address.recipientName,
      phone: address.phone,
      country: address.country,
      state: address.state ?? "",
      city: address.city,
      street: address.street,
      postal_code: address.postalCode
    };
  }

  const dailyLimitCheck = await checkNewSellerDailyLimit({
    sellerAgentId: asset.sellerAgentId,
    windowDays: env.NEW_SELLER_WINDOW_DAYS,
    dailyLimit: env.NEW_SELLER_DAILY_ORDER_LIMIT
  });

  if (!dailyLimitCheck.allowed) {
    return fail("RISK_LIMIT", "New seller daily order limit reached", 429);
  }

  const amount = Number(asset.price);
  const deadline = new Date();
  let baseDays = asset.assetType === "physical" ? 7 : 1;
  if (amount >= env.LARGE_ORDER_THRESHOLD_USD) {
    baseDays += env.LARGE_ORDER_EXTENSION_DAYS;
  }
  deadline.setDate(deadline.getDate() + baseDays);

  const [order] = await db
    .insert(orders)
    .values({
      buyerAgentId: buyer.id,
      sellerAgentId: asset.sellerAgentId,
      assetId: asset.id,
      amount: asset.price,
      currency: "USD",
      status: "created",
      shippingAddressSnapshot,
      confirmationMode: parsed.data.confirmation_mode ?? "auto_timeout_confirm",
      confirmDeadline: deadline
    })
    .returning();

  return ok({ success: true, order }, 201);
}
