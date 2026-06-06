// Instant skeleton shown while the editor's server fetch resolves (App Router
// Suspense) — replaces the old client-side "Loading editor..." flash.
export default function EditorLoading() {
  return (
    <main className="min-h-screen bg-[#0A0A0F] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl animate-pulse">
        <div className="flex justify-end gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-28 rounded-lg bg-white/[0.05]" />
          ))}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
          <div>
            <div className="h-10 w-64 rounded bg-white/10" />
            <div className="mt-6 h-28 rounded-lg bg-white/[0.05]" />
          </div>
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="h-12 rounded-lg bg-white/[0.05]" />
              <div className="h-12 rounded-lg bg-white/[0.05]" />
            </div>
            <div className="h-28 rounded-lg bg-white/[0.05]" />
            <div className="h-40 rounded-lg bg-white/[0.04]" />
            <div className="h-40 rounded-lg bg-white/[0.04]" />
            <div className="h-12 rounded-lg bg-white/[0.05]" />
          </div>
        </div>
      </div>
    </main>
  )
}
