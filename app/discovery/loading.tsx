// Instant skeleton while the directory (server-fetched) loads.
export default function DirectoryLoading() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] px-6 py-10 text-white">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-10 w-64 rounded bg-white/10" />
        <div className="mt-5 h-14 rounded-lg bg-white/[0.05]" />
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-44 rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      </div>
    </main>
  )
}
