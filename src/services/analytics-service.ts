import { db } from "@/db/client";
import { pageVisits } from "@/db/schema";
import { headers } from "next/headers";

export interface VisitData {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
}

/**
 * Extract UTM parameters and referrer from URL
 */
export function extractTrackingData(
  searchParams: Record<string, string | string[] | undefined>,
  headersInstance?: Headers
): VisitData {
  const utmSource = getStringParam(searchParams.utm_source);
  const utmMedium = getStringParam(searchParams.utm_medium);
  const utmCampaign = getStringParam(searchParams.utm_campaign);
  const utmTerm = getStringParam(searchParams.utm_term);
  const utmContent = getStringParam(searchParams.utm_content);

  let referrer: string | undefined;
  if (headersInstance) {
    referrer = headersInstance.get("referer") || headersInstance.get("referrer") || undefined;
  }

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    referrer
  };
}

/**
 * Get string parameter (handle array case)
 */
function getStringParam(
  param: string | string[] | undefined
): string | undefined {
  if (!param) return undefined;
  return Array.isArray(param) ? param[0] : param;
}

/**
 * Track page visit asynchronously (don't block page rendering)
 */
export async function trackPageVisit(path: string, visitData: VisitData): Promise<void> {
  try {
    await db.insert(pageVisits).values({
      path,
      utmSource: visitData.utmSource,
      utmMedium: visitData.utmMedium,
      utmCampaign: visitData.utmCampaign,
      utmTerm: visitData.utmTerm,
      utmContent: visitData.utmContent,
      referrer: visitData.referrer
    });
  } catch (error) {
    // Silent failure, don't affect user experience
    console.error("Failed to track page visit:", error);
  }
}

/**
 * Get traffic statistics
 */
export async function getTrafficStats(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const visits = await db
    .select({
      utmSource: pageVisits.utmSource,
      utmMedium: pageVisits.utmMedium,
      utmCampaign: pageVisits.utmCampaign,
      visitedAt: pageVisits.visitedAt
    })
    .from(pageVisits);

  // Group by source
  const bySource = visits.reduce((acc, visit) => {
    const source = visit.utmSource || "(direct)";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by medium
  const byMedium = visits.reduce((acc, visit) => {
    const medium = visit.utmMedium || "(none)";
    acc[medium] = (acc[medium] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by campaign
  const byCampaign = visits.reduce((acc, visit) => {
    const campaign = visit.utmCampaign || "(none)";
    acc[campaign] = (acc[campaign] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group by date
  const byDate = visits.reduce((acc, visit) => {
    const date = visit.visitedAt.toISOString().split("T")[0];
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalVisits = visits.length;
  const trackedVisits = visits.filter(v => v.utmSource).length;
  const directVisits = totalVisits - trackedVisits;

  return {
    totalVisits,
    trackedVisits,
    directVisits,
    bySource,
    byMedium,
    byCampaign,
    byDate,
    topSources: Object.entries(bySource)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([source, count]) => ({ source, count })),
    topCampaigns: Object.entries(byCampaign)
      .filter(([campaign]) => campaign !== "(none)")
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([campaign, count]) => ({ campaign, count }))
  };
}

/**
 * Get recent visit records
 */
export async function getRecentVisits(limit: number = 50) {
  return await db
    .select({
      path: pageVisits.path,
      utmSource: pageVisits.utmSource,
      utmMedium: pageVisits.utmMedium,
      utmCampaign: pageVisits.utmCampaign,
      utmTerm: pageVisits.utmTerm,
      utmContent: pageVisits.utmContent,
      referrer: pageVisits.referrer,
      visitedAt: pageVisits.visitedAt
    })
    .from(pageVisits)
    .orderBy(pageVisits.visitedAt)
    .limit(limit);
}
