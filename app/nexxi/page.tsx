import type { Metadata } from 'next'
import { NexxiChat } from '../../components/nexxi-chat'

export const metadata: Metadata = {
  title: 'Nexxi | Personal buyer agent',
  description: 'Talk to Nexxi to search Nexez listings, negotiate offers, and start bookings with approval.',
}

export default function NexxiPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-[#050507] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-18rem] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[var(--signal)]/15 blur-3xl" />
        <div className="absolute bottom-[-16rem] right-[-12rem] h-[28rem] w-[28rem] rounded-full bg-[var(--signal)]/10 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-8 px-4 py-6 md:grid-cols-[0.9fr_1fr] md:px-8">
        <section className="hidden md:block">
          <div className="mb-5 inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs uppercase tracking-[0.22em] text-white/55">
            Nexez buyer app
          </div>
          <h1 className="max-w-xl text-5xl font-semibold tracking-[-0.07em] text-white">
            Your personal agent for buying through the agentic web.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-white/58">
            Nexxi searches AI-ready Nexez listings, compares offers, negotiates on your behalf, and asks before taking action.
          </p>
          <div className="mt-8 grid max-w-lg gap-3">
            {[
              'Voice or text input for fast mobile operation',
              'Approval cards before negotiation, booking, or checkout',
              'Buyer memory for budget, timing, location, and preferences',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/70 backdrop-blur-xl">
                {item}
              </div>
            ))}
          </div>
        </section>

        <div className="mx-auto w-full max-w-md">
          <NexxiChat />
        </div>
      </div>
    </main>
  )
}
