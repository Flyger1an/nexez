import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type SurfaceHeaderProps = {
  eyebrow: ReactNode
  title: ReactNode
  icon?: LucideIcon
  description?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
}

/** Shared operational-page masthead, derived from the listing Settings surface. */
export function SurfaceHeader({
  eyebrow,
  title,
  icon: Icon,
  description,
  actions,
  footer,
  className,
}: SurfaceHeaderProps) {
  return (
    <header
      className={classes(
        'overflow-hidden rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] p-5 shadow-none backdrop-blur-[var(--blur-card)] sm:p-7',
        className,
      )}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl flex-1">
          <div className="surface-eyebrow">{eyebrow}</div>
          <div className="mt-3 flex items-center gap-3">
            {Icon ? (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--settings-emphasis)]">
                <Icon className="size-5" aria-hidden="true" />
              </span>
            ) : null}
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--fg)] sm:text-4xl">{title}</h1>
          </div>
          {description ? (
            <div className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex min-w-0 flex-wrap gap-3 lg:max-w-[58%] lg:justify-end">{actions}</div> : null}
      </div>
      {footer ? (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--line-soft)] pt-5">{footer}</div>
      ) : null}
    </header>
  )
}

export const surfaceActionClass =
  'settings-emphasis-action inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--fg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--settings-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]'
