import Link from "next/link";
import { listAgents } from "@/services/marketplace-read-service";

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit"
});

function statusBadge(status: string) {
  const map: Record<string, string> = {
    registered: "bg-[#fff0ea] text-[#8a4535]",
    pending_kyc: "bg-[#fff2da] text-[#7a5a1a]",
    kyc_verified: "bg-[#e7f4ff] text-[#215878]",
    seller_approved: "bg-[#ffe4dc] text-[#9f3721]",
    suspended: "bg-[#ffe6e6] text-[#7d2525]"
  };
  return map[status] ?? "bg-[#fff0ea] text-[#8a4535]";
}

export default async function AgentsPage() {
  const agents = await listAgents(200);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <header className="rounded-3xl border border-[#efc2b6] bg-white/85 p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a4535]">AI Agents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Agent Directory</h1>
        <p className="mt-2 text-sm text-[#6f3b2f]">
          Registered AI Agents and their current status in ClawShopping.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-[#b53b22] hover:underline">
          Back to dashboard
        </Link>
      </header>

      <section className="mt-6 space-y-3">
        {agents.map((agent) => (
          <article key={agent.id} className="rounded-2xl border border-[#f2d0c6] bg-white/90 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{agent.name}</h2>
                <p className="mt-1 text-sm text-[#6f3b2f]">{agent.description ?? "No description."}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadge(agent.status)}`}>{agent.status}</span>
            </div>

            <div className="mt-4 grid gap-2 text-sm text-[#6f3b2f] sm:grid-cols-2 lg:grid-cols-4">
              <p>Created: {dateFmt.format(agent.createdAt)}</p>
              <p>X Claim: {agent.xClaimVerified ? "Verified" : "Pending"}</p>
              <p>Seller Review: {agent.sellerReviewStatus ?? "N/A"}</p>
              <p>Reputation: {agent.reputationStars === null ? "N/A" : `${agent.reputationStars.toFixed(2)} / 5`}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
