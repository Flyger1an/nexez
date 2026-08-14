export default function AdminLoading() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading admin control panel">
      <div className="h-4 w-28 animate-pulse rounded bg-white/[0.08]" />
      <div className="mt-4 h-9 w-64 animate-pulse rounded bg-white/[0.08]" />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-32 animate-pulse rounded-lg border border-border bg-white/[0.025]" />)}
      </div>
      <div className="mt-6 h-80 animate-pulse rounded-lg border border-border bg-white/[0.025]" />
    </main>
  )
}
