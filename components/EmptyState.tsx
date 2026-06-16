import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'

export type EmptyStateCta = {
  label: string
  href: string
  variant?: 'primary' | 'secondary'
  external?: boolean
}

/**
 * Shared "nothing here yet" surface — warm, encouraging, with a clear next step.
 * Models the Negotiations / Onboarding empty states so every surface reads the same
 * instead of one-off flat "No data" placeholders. Server-component-safe (no hooks);
 * uses on-palette tokens (--signal/--ready + zinc) so it passes the palette guard.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  ctas = [],
  highlight = false,
  className = '',
}: {
  icon?: ComponentType<LucideProps>
  title: string
  children?: ReactNode
  ctas?: EmptyStateCta[]
  /** Signal-gradient backdrop for first-run / hero empties (vs the quiet dashed default). */
  highlight?: boolean
  className?: string
}) {
  return (
    <div
      className={`nx-rise rounded-2xl border p-8 text-center ${
        highlight
          ? 'border-[var(--signal)]/30 bg-gradient-to-br from-[var(--signal)]/10 to-[var(--ready)]/5'
          : 'border-dashed border-white/10 bg-white/[0.02]'
      } ${className}`}
    >
      {Icon ? (
        <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--signal)]/10 text-[var(--signal)]">
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="text-base font-medium text-white">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">{children}</div> : null}
      {ctas.length ? (
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {ctas.map((cta) => (
            <a
              key={cta.href + cta.label}
              href={cta.href}
              {...(cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={
                cta.variant === 'secondary'
                  ? 'inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-200 transition-colors hover:bg-white/5'
                  : 'inline-flex items-center gap-2 rounded-lg border border-[var(--signal)]/40 bg-[var(--signal)]/10 px-4 py-2 text-sm font-semibold text-[var(--signal)] transition-colors hover:bg-[var(--signal)]/20'
              }
            >
              {cta.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  )
}
