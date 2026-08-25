import { BookOpenCheck } from 'lucide-react'
import type { CommerceTemplateLineageSummary } from '../../lib/commerce-template-lineage'

const ADOPTION_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

export function TemplateLineageCard({
  lineage,
}: {
  lineage: CommerceTemplateLineageSummary
}) {
  const adoptedDate = ADOPTION_DATE_FORMATTER.format(new Date(lineage.adoptedAt))

  return (
    <aside
      aria-label="Commerce Template guidance"
      className="rounded-[var(--radius)] border border-[var(--settings-emphasis)]/25 bg-[var(--settings-emphasis)]/[0.06] p-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-[var(--radius-sm)] border border-[var(--settings-emphasis)]/25 bg-[var(--settings-emphasis)]/10 p-2 text-[var(--settings-emphasis)]">
          <BookOpenCheck aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--fg)]">
            {lineage.referenceAvailable ? `Guided by ${lineage.title}` : lineage.title}
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">
            {lineage.referenceAvailable
              ? `Nexxi used version ${lineage.templateVersion} of this setup guide to choose relevant interview questions. Your listing details always remain yours.`
              : `This listing began with the ${lineage.templateId} setup guide, version ${lineage.templateVersion}. That guide is no longer available. Your listing remains unchanged.`}
          </p>
          <p className="mt-2 text-xs text-[var(--fg-subtle)]">Selected {adoptedDate}</p>
        </div>
      </div>
    </aside>
  )
}
