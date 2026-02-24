import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PLATFORM_ACCOUNT_ID: z.string().min(1).optional(),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(500),
  NEW_SELLER_WINDOW_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  NEW_SELLER_DAILY_ORDER_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  ADDRESS_CHURN_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(10),
  LARGE_ORDER_THRESHOLD_USD: z.coerce.number().positive().default(1000),
  LARGE_ORDER_EXTENSION_DAYS: z.coerce.number().int().min(0).max(30).default(3),
  AUTH_MAX_SKEW_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  ADMIN_API_TOKEN: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  X_BEARER_TOKEN: z.string().min(1).optional(),
  X_CLAIM_CHALLENGE_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),
  X_CLAIM_POLL_WINDOW_MINUTES: z.coerce.number().int().min(5).max(10080).default(180),
  REDIS_URL: z.string().url().optional(),
  CLAWSHOP_BASE_URL: z.string().url().optional()
});

export const env = envSchema.parse(process.env);
