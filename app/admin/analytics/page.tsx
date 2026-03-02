import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { pageVisits } from "@/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin-auth";
import { headers } from "next/headers";

interface TrafficStats {
  totalVisits: number;
  trackedVisits: number;
  directVisits: number;
  bySource: Record<string, number>;
  byMedium: Record<string, number>;
  byCampaign: Record<string, number>;
  topSources: Array<{ source: string; count: number }>;
  topCampaigns: Array<{ campaign: string; count: number }>;
}

async function getTrafficStats(days: number = 30): Promise<TrafficStats> {
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

export default async function AnalyticsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Check admin authorization
  const headersList = await headers();
  if (!requireAdmin(headersList)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Unauthorized</h1>
          <p className="mt-2 text-gray-600">Admin access required</p>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const days = parseInt((params.days as string) || "30", 10);
  const stats = await getTrafficStats(days);

  return (
    <main className="mx-auto w-full max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Traffic Analytics</h1>
        <p className="mt-1 text-gray-600">Track your website traffic sources</p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Visits</CardTitle>
            <CardDescription>All page visits</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalVisits.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tracked Visits</CardTitle>
            <CardDescription>With UTM parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.trackedVisits.toLocaleString()}</p>
            <p className="mt-1 text-sm text-gray-600">
              {stats.totalVisits > 0 ? ((stats.trackedVisits / stats.totalVisits) * 100).toFixed(1) : "0"}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Direct Visits</CardTitle>
            <CardDescription>No UTM parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.directVisits.toLocaleString()}</p>
            <p className="mt-1 text-sm text-gray-600">
              {stats.totalVisits > 0 ? ((stats.directVisits / stats.totalVisits) * 100).toFixed(1) : "0"}% of total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Sources */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Traffic Sources</CardTitle>
            <CardDescription>UTM source breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topSources.length === 0 ? (
                <p className="text-gray-500">No tracked visits yet</p>
              ) : (
                stats.topSources.map((item) => (
                  <div key={item.source} className="flex items-center justify-between">
                    <span className="font-medium">{item.source}</span>
                    <span className="text-sm text-gray-600">
                      {item.count.toLocaleString()} visits
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Campaigns</CardTitle>
            <CardDescription>UTM campaign breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topCampaigns.length === 0 ? (
                <p className="text-gray-500">No campaigns tracked yet</p>
              ) : (
                stats.topCampaigns.map((item) => (
                  <div key={item.campaign} className="flex items-center justify-between">
                    <span className="font-medium">{item.campaign}</span>
                    <span className="text-sm text-gray-600">
                      {item.count.toLocaleString()} visits
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Medium Breakdown */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Traffic by Medium</CardTitle>
          <CardDescription>UTM medium breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.keys(stats.byMedium).length === 0 ? (
              <p className="text-gray-500">No medium data yet</p>
            ) : (
              Object.entries(stats.byMedium)
                .sort(([, a], [, b]) => b - a)
                .map(([medium, count]) => (
                  <div key={medium} className="flex items-center justify-between rounded-md border p-3">
                    <span className="font-medium">{medium}</span>
                    <span className="text-sm text-gray-600">{count.toLocaleString()}</span>
                  </div>
                ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>How to Track Traffic</CardTitle>
          <CardDescription>Using UTM parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-medium">Example URL with UTM parameters:</p>
            <code className="mt-2 block rounded-md bg-gray-100 p-3 text-sm">
              https://clawshopping.com/?utm_source=open-claude-cowork&utm_medium=website&utm_campaign=hero_cta
            </code>
          </div>
          <div>
            <p className="font-medium">UTM Parameters:</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-600">
              <li>
                <strong>utm_source:</strong> The referrer (e.g., google, newsletter, open-claude-cowork)
              </li>
              <li>
                <strong>utm_medium:</strong> Marketing medium (e.g., cpc, banner, email, website)
              </li>
              <li>
                <strong>utm_campaign:</strong> Product, promo code, or slogan (e.g., hero_cta, spring_sale)
              </li>
              <li>
                <strong>utm_term:</strong> Search terms (optional)
              </li>
              <li>
                <strong>utm_content:</strong> Use to differentiate ads (optional)
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium">How to Access This Page:</p>
            <p className="mt-2 text-sm text-gray-600">
              Set the <code className="rounded bg-gray-100 px-1">ADMIN_API_TOKEN</code> environment variable
              and access this page with the <code className="rounded bg-gray-100 px-1">Authorization: Bearer &lt;token&gt;</code> header.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              For example, using curl:
            </p>
            <code className="mt-2 block rounded-md bg-gray-100 p-3 text-sm">
              curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" http://localhost:3000/admin/analytics
            </code>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
