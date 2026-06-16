import { Mail, Package } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Find your order · Nexez',
  robots: { index: false, follow: false },
}

// Buyers reach their order via the unguessable link in their receipt email
// (/orders/<token>). This is the bare landing for someone who hits /orders directly.
// (Email-based "find all my orders" lookup is a planned follow-up.)
export default function OrdersIndexPage() {
  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Package className="size-7 text-[var(--signal)]" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Find your order</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">
          Open the order link from your purchase receipt email to view your order, track its status, request a refund, or
          report a problem.
        </p>
        <p className="mt-6 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2.5 text-sm text-zinc-300">
          <Mail className="size-4 text-zinc-500" /> Can’t find it? Check your inbox for a receipt from the seller.
        </p>
      </div>
    </main>
  )
}
