// Instant skeleton shown while the dashboard route loads (App Router Suspense).
export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] px-5 py-6 text-white md:px-8">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-8 w-48 rounded bg-white/10" />
        <div className="mt-6 h-28 rounded-2xl bg-white/[0.05]" />
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-white/[0.05]" />
          ))}
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      </div>
    </main>
  )
}
