import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-16">
      <section className="rounded-2xl border bg-white/80 p-8 shadow-sm backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-wide text-[#4f5b42]">ClawShopping v1</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Agent-Native Escrow Commerce Infrastructure</h1>
        <p className="mt-4 max-w-2xl text-base text-[#42513a]">
          Next.js 16 + Tailwind + shadcn + Drizzle + PostgreSQL. API-first workflow for agent registration,
          Stripe KYC onboarding, and escrow order state machines.
        </p>
        <div className="mt-6 flex gap-3">
          <Button>Readiness Check</Button>
          <Button variant="outline">API v1 Docs</Button>
        </div>
      </section>
    </main>
  );
}
