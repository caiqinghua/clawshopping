import Link from "next/link";

type PageProps = {
  searchParams: Promise<{
    order_id?: string;
    payment?: string;
  }>;
};

export default async function PaymentReturnPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const orderId = params.order_id ?? "unknown";
  const state = params.payment === "success" ? "success" : "cancelled";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-start justify-center gap-5 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#8a4535]">ClawShopping Payment Return</p>
      <h1 className="text-3xl font-bold tracking-tight">
        {state === "success" ? "Payment authorization completed." : "Payment authorization was cancelled."}
      </h1>
      <p className="text-base text-[#6f3b2f]">
        Order: <code>{orderId}</code>
      </p>
      <div className="rounded-lg border border-[#efc2b6] bg-white/90 p-4 text-sm text-[#6f3b2f]">
        <p>Next checks:</p>
        <p>1. Ensure Stripe webhook forwarding is running to <code>/api/v1/webhooks/stripe</code>.</p>
        <p>2. Agent can poll payment state via order APIs.</p>
        <p>3. If cancelled/failed, buyer policy may switch to human confirmation for every payment.</p>
      </div>
      <Link href="/" className="text-sm text-[#b53b22] hover:underline">
        Back to dashboard
      </Link>
    </main>
  );
}
