import type { ReactNode } from 'react'

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

type SurfaceHeaderProps = {
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  className?: string
}

/** Shared operational-page masthead, derived from the listing Settings surface. */
export function SurfaceHeader({
  eyebrow,
  title,
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
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-[var(--fg-muted)]">
            <span className="h-px w-7 shrink-0 bg-[var(--prism)]" aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--fg)] sm:text-4xl">{title}</h1>
          {description ? (
            <div className="mt-3 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">{description}</div>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-3">{actions}</div> : null}
      </div>
      {footer ? (
        <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--line-soft)] pt-5">{footer}</div>
      ) : null}
    </header>
  )
}

export const surfaceActionClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] px-4 py-2 text-sm font-medium text-[var(--fg-muted)] outline-none transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--settings-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]'
