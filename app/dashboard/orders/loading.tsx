export default function OrdersLoading() {
  return (
    <main className="nx-platform-surface min-h-screen bg-[var(--bg)] px-4 py-6 text-[var(--fg)] sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1680px] animate-pulse">
        <div className="h-52 rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)]" />
        <div className="mt-6 h-24 rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)]" />
        <div className="mt-6 space-y-2 rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-4">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 rounded-[var(--radius)] bg-[var(--fill-1)]" />)}
        </div>
      </div>
    </main>
  )
}
