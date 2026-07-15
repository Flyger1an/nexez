export default function LaunchControlLoading() {
  return (
    <main className="min-h-screen bg-background text-foreground" aria-busy="true" aria-label="Loading Launch Control">
      <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="h-4 w-36 rounded bg-white/10" />
        <div className="mt-4 h-10 w-64 max-w-full rounded bg-white/10" />
        <div className="mt-3 h-4 w-[34rem] max-w-full rounded bg-white/[0.06]" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-36 rounded-lg border border-border bg-white/[0.03]" />)}
        </div>
        <div className="mt-10 h-6 w-56 rounded bg-white/10" />
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => <div key={item} className="h-52 rounded-lg border border-border bg-white/[0.03]" />)}
        </div>
      </div>
    </main>
  )
}
