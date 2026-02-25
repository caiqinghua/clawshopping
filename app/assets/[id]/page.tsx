import Link from "next/link";
import { notFound } from "next/navigation";
import { getApprovedAssetDetail } from "@/services/marketplace-read-service";

const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFmt = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit"
});

function starText(stars: number | null) {
  if (stars === null) return "N/A";
  return `${stars.toFixed(2)} / 5`;
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getApprovedAssetDetail(id);
  if (!asset) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <header className="rounded-3xl border border-[#cad8c3] bg-white/90 p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5a6950]">Asset Detail</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{asset.title}</h1>
        <p className="mt-2 text-sm text-[#4b5a42]">{asset.description ?? "No description."}</p>
        <div className="mt-5 grid gap-2 text-sm text-[#42513a] sm:grid-cols-2">
          <p>Price: {currencyFmt.format(asset.price)}</p>
          <p>Type: {asset.assetType}</p>
          <p>Inventory: {asset.inventory}</p>
          <p>Created: {dateFmt.format(asset.createdAt)}</p>
          <p>Seller: {asset.sellerName}</p>
          <p>Seller Review: {asset.sellerReviewStatus ?? "N/A"}</p>
          <p>Seller Reputation: {starText(asset.sellerReputationStars)}</p>
          <p>Seller Score: {asset.sellerReputationScore === null ? "N/A" : asset.sellerReputationScore.toFixed(2)}</p>
          <p>
            Asset Rating: {asset.averageRating === null ? "No rating yet" : `${asset.averageRating.toFixed(2)} / 5`}
          </p>
          <p>Comments: {asset.commentCount}</p>
        </div>
        <div className="mt-5 flex flex-wrap gap-4">
          <Link href="/assets" className="text-sm text-[#0b6a5a] hover:underline">
            Back to assets
          </Link>
          <Link href="/agents" className="text-sm text-[#0b6a5a] hover:underline">
            Browse agents
          </Link>
        </div>
      </header>

      <section className="mt-6">
        <h2 className="text-xl font-semibold">Comments</h2>
        <div className="mt-4 space-y-3">
          {asset.comments.length === 0 ? (
            <div className="rounded-2xl border border-[#d9e3d2] bg-white/90 p-4 text-sm text-[#4b5a42]">
              No comments yet.
            </div>
          ) : (
            asset.comments.map((comment) => (
              <article key={comment.id} className="rounded-2xl border border-[#d9e3d2] bg-white/90 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{comment.reviewerName}</p>
                  <p className="text-xs text-[#5d6a54]">{dateFmt.format(comment.createdAt)}</p>
                </div>
                <p className="mt-1 text-sm text-[#42513a]">Rating: {comment.rating} / 5</p>
                <p className="mt-2 text-sm text-[#1f251a]">{comment.content}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
