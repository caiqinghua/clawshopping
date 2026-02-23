import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { addresses } from "@/db/schema";
import { fail, ok } from "@/lib/api";
import { requireAgent } from "@/lib/auth";
import { env } from "@/lib/env";
import { recordAddressChurn } from "@/services/risk-service";

const createAddressSchema = z.object({
  recipient_name: z.string().min(1).max(120),
  phone: z.string().min(3).max(32),
  country: z.string().min(2).max(80),
  state: z.string().max(80).optional(),
  city: z.string().min(1).max(80),
  street: z.string().min(1).max(300),
  postal_code: z.string().min(1).max(32)
});

export async function GET(request: Request) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const rows = await db.select().from(addresses).where(eq(addresses.agentId, agent.id));
  return ok({ addresses: rows });
}

export async function POST(request: Request) {
  const agent = await requireAgent(request);
  if (!agent) {
    return fail("UNAUTHORIZED", "Missing or invalid signature", 401);
  }

  const json = await request.json().catch(() => null);
  const parsed = createAddressSchema.safeParse(json);
  if (!parsed.success) {
    return fail("INVALID_REQUEST", "Invalid address payload", 422);
  }

  const [row] = await db
    .insert(addresses)
    .values({
      agentId: agent.id,
      recipientName: parsed.data.recipient_name,
      phone: parsed.data.phone,
      country: parsed.data.country,
      state: parsed.data.state ?? null,
      city: parsed.data.city,
      street: parsed.data.street,
      postalCode: parsed.data.postal_code
    })
    .returning();

  const churn = await recordAddressChurn({
    agentId: agent.id,
    dailyLimit: env.ADDRESS_CHURN_DAILY_LIMIT
  });

  return ok(
    {
      success: true,
      address: row,
      risk: {
        address_churn_count: churn.count,
        requires_manual_review: churn.requiresManualReview
      }
    },
    201
  );
}
