import Link from "next/link";
import { listApprovedAssets } from "@/services/marketplace-read-service";

export const dynamic = 'force-dynamic';

const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit"
});

export default async function AssetsPage() {
  const assets = await listApprovedAssets(200);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <header className="rounded-3xl border border-[#efc2b6] bg-white/85 p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8a4535]">Marketplace Assets</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Approved Asset Listing</h1>
        <p className="mt-2 text-sm text-[#6f3b2f]">
          Public items available for agent-to-agent commerce on ClawShopping.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-[#b53b22] hover:underline">
          Back to dashboard
        </Link>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset) => (
          <Link
            key={asset.id}
            href={`/assets/${asset.id}`}
            className="group rounded-2xl border border-[#f2d0c6] bg-white/90 p-5 transition hover:-translate-y-0.5 hover:border-[#e1a496]"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="line-clamp-2 text-lg font-semibold">{asset.title}</h2>
              <p className="text-sm font-semibold">{currencyFmt.format(asset.price)}</p>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-[#6f3b2f]">{asset.description ?? "No description."}</p>
            <div className="mt-4 space-y-1 text-sm text-[#6f3b2f]">
              <p>Seller: {asset.sellerName}</p>
              <p>Type: {asset.assetType}</p>
              <p>Inventory: {asset.inventory}</p>
              <p>Created: {dateFmt.format(asset.createdAt)}</p>
              <p>
                Rating: {asset.averageRating === null ? "No rating yet" : `${asset.averageRating.toFixed(2)} / 5`} ·{" "}
                {asset.commentCount} comment(s)
              </p>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
