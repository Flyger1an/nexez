import { GrowthControlPanel } from '../../../components/dashboard/GrowthControlPanel'
import { requirePlatformAdmin } from '../../../lib/server/admin-access'
import { getGrowthControlSnapshot } from '../../../lib/server/growth-control'

export default async function AdminGrowthPage() {
  await requirePlatformAdmin('/admin/growth')
  const growthControl = await getGrowthControlSnapshot()

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 lg:py-2">
        <GrowthControlPanel initialSnapshot={growthControl} />
        <footer className="border-t border-border py-5 text-xs text-[var(--fg-muted-2)]">
          Snapshot generated {new Date(growthControl.generatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC.
        </footer>
      </div>
    </main>
  )
}
