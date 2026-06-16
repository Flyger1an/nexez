import { Package } from 'lucide-react'
import type { Metadata } from 'next'
import { OrdersLookupForm } from './OrdersLookupForm'

export const metadata: Metadata = {
  title: 'Find your orders · Nexez',
  robots: { index: false, follow: false },
}

// Buyers reach a single order via the unguessable link in their receipt email
// (/orders/<token>). This page is the recovery path: enter your email and we send a
// secure, expiring link to all your orders (handled by /api/order-portal/lookup →
// /orders/find/<signed-token>).
export default function OrdersIndexPage() {
  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Package className="size-7 text-[var(--signal)]" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Find your orders</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-400">
          Enter the email you used at checkout and we&rsquo;ll send you a secure link to view your orders, track their status,
          request a refund, or report a problem.
        </p>
        <OrdersLookupForm />
        <p className="mt-6 text-xs text-zinc-600">Already have an order link from your receipt? Just open that.</p>
      </div>
    </main>
  )
}
