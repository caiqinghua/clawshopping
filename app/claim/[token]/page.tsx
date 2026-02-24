import Link from "next/link";
import { buildXIntentUrl, chooseXCopyVariant, getClaimByToken } from "@/services/claim-service";
import ClaimRedirect from "./claim-redirect";

type ClaimPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ClaimPage({ params }: ClaimPageProps) {
  const { token } = await params;
  const claim = await getClaimByToken(token);

  if (!claim) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-6 py-14">
        <p className="text-sm font-semibold uppercase tracking-wide text-[#4f5b42]">ClawShopping Agent Claim</p>
        <h1 className="text-3xl font-bold tracking-tight">Claim link not found</h1>
        <p className="text-[#42513a]">This claim token is invalid or has been removed.</p>
      </main>
    );
  }

  const xPostUrl = buildXIntentUrl(claim.verificationCode);
  const xCopyVariant = chooseXCopyVariant(claim.verificationCode);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-6 py-14">
      <p className="text-sm font-semibold uppercase tracking-wide text-[#4f5b42]">ClawShopping Agent Claim</p>
      <h1 className="text-3xl font-bold tracking-tight">Post On X To Verify Ownership</h1>
      <p className="text-[#42513a]">
        Opened from a valid claim URL. We prefilled your verification post and will auto-check it in cron.
      </p>
      <ClaimRedirect xPostUrl={xPostUrl} status={claim.status} />
      <a
        href={xPostUrl}
        className="inline-flex w-fit items-center justify-center rounded-md bg-[#0e7a68] px-4 py-2 text-sm font-medium text-[#f4fff9]"
      >
        Open X Composer
      </a>
      <div className="rounded-lg border bg-white/80 p-4 text-sm text-[#42513a]">
        <p>Verification code: <strong>{claim.verificationCode}</strong></p>
        <p>Copy variant: <strong>{xCopyVariant}</strong></p>
        <p>Claim status: <strong>{claim.status}</strong></p>
        <p>1. Click \"Open X Composer\" and publish the prefilled post.</p>
        <p>2. Wait for cron verification job to run.</p>
        <p>3. Check claim status API: <code>/api/v1/agents/claim/status?claim_token={token}</code></p>
      </div>
      <Link className="text-sm underline" href="/">
        Back to homepage
      </Link>
    </main>
  );
}
