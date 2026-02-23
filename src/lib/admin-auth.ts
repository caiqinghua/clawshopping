import { env } from "@/lib/env";

export function requireAdmin(headers: Headers) {
  if (!env.ADMIN_API_TOKEN) {
    return false;
  }

  const raw = headers.get("authorization") ?? "";
  const token = raw.startsWith("Bearer ") ? raw.slice("Bearer ".length).trim() : "";
  return token.length > 0 && token === env.ADMIN_API_TOKEN;
}

export function requireCron(headers: Headers) {
  if (!env.CRON_SECRET) {
    return false;
  }

  const raw = headers.get("authorization") ?? "";
  const token = raw.startsWith("Bearer ") ? raw.slice("Bearer ".length).trim() : "";
  return token.length > 0 && token === env.CRON_SECRET;
}
