'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Loader2, type LucideIcon } from 'lucide-react'

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export type SettingsSwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  describedBy?: string
  checkedLabel?: string
  uncheckedLabel?: string
  pendingLabel?: string
  disabled?: boolean
  pending?: boolean
  id?: string
  className?: string
}

/**
 * Compact binary control for listing settings. The visible track is 46x27px,
 * while the button keeps a 44px minimum touch target. State is communicated by
 * track color, thumb position, aria-checked, and a visible text label.
 */
export function SettingsSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  describedBy,
  checkedLabel = 'On',
  uncheckedLabel = 'Off',
  pendingLabel = 'Saving…',
  disabled = false,
  pending = false,
  id,
  className,
}: SettingsSwitchProps) {
  const generatedId = useId()
  const switchId = id ?? `settings-switch-${generatedId}`
  const descriptionId = description ? `${switchId}-description` : undefined
  const describedByIds = [describedBy, descriptionId].filter(Boolean).join(' ') || undefined
  const stateLabel = pending ? pendingLabel : checked ? checkedLabel : uncheckedLabel
  const unavailable = disabled || pending

  return (
    <div className={classes('inline-flex min-w-0 items-center justify-end gap-2.5', className)}>
      {description ? <span id={descriptionId} className="sr-only">{description}</span> : null}
      <span
        className={classes(
          'inline-flex min-w-14 items-center justify-end gap-1.5 text-xs font-medium tabular-nums',
          pending ? 'text-[var(--fg-muted)]' : checked ? 'text-[var(--ready)]' : 'text-[var(--fg-muted)]',
        )}
        aria-live="polite"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
        {stateLabel}
      </span>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedByIds}
        aria-busy={pending || undefined}
        disabled={unavailable}
        onClick={() => onCheckedChange(!checked)}
        className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-[var(--r-pill)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span
          aria-hidden="true"
          className={classes(
            'relative block h-[27px] w-[46px] rounded-[var(--r-pill)] border transition-colors duration-200 motion-reduce:transition-none',
            checked
              ? 'border-transparent bg-[var(--control-on)]'
              : 'border-[var(--control-off-border)] bg-[var(--control-off)]',
          )}
        >
          <span
            className={classes(
              'absolute left-[3px] top-[3px] block size-[21px] rounded-[var(--r-pill)] shadow-[var(--control-thumb-shadow)] transition-[transform,background-color] duration-200 motion-reduce:transition-none',
              checked
                ? 'translate-x-[19px] bg-[var(--control-on-thumb)]'
                : 'translate-x-0 bg-[var(--control-off-thumb)]',
            )}
          />
        </span>
      </button>
    </div>
  )
}

export type SettingsSectionProps = {
  id: string
  title: string
  description?: string
  icon?: LucideIcon
  status?: ReactNode
  action?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function SettingsSection({
  id,
  title,
  description,
  icon: Icon,
  status,
  action,
  footer,
  children,
  className,
  contentClassName,
}: SettingsSectionProps) {
  const headingId = `${id}-heading`

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={classes(
        'scroll-mt-28 overflow-hidden rounded-[var(--r-card)] border border-[var(--line-soft)] bg-[var(--glass)] shadow-[var(--settings-panel-shadow)] backdrop-blur-[var(--blur-card)]',
        className,
      )}
    >
      <header className="flex flex-col gap-4 border-b border-[var(--line-soft)] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 gap-3">
          {Icon ? (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--fill-1)] text-[var(--fg-muted)]">
              <Icon className="size-4" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-semibold tracking-tight text-[var(--fg)]">{title}</h2>
            {description ? (
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--fg-muted)]">{description}</p>
            ) : null}
          </div>
        </div>
        {status || action ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {status}
            {action}
          </div>
        ) : null}
      </header>
      <div className={classes('divide-y divide-[var(--line-soft)]', contentClassName)}>{children}</div>
      {footer ? (
        <footer className="border-t border-[var(--line-soft)] bg-[var(--fill-1)] px-5 py-4 sm:px-6">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

export type SettingRowProps = {
  label: string
  description?: ReactNode
  htmlFor?: string
  children: ReactNode
  className?: string
  controlClassName?: string
}

export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  className,
  controlClassName,
}: SettingRowProps) {
  const labelClass = 'text-sm font-medium leading-5 text-[var(--fg)]'

  return (
    <div
      className={classes(
        'grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.82fr)] lg:items-start',
        className,
      )}
    >
      <div className="min-w-0">
        {htmlFor ? <label htmlFor={htmlFor} className={labelClass}>{label}</label> : <div className={labelClass}>{label}</div>}
        {description ? (
          <div className="mt-1 max-w-xl text-sm leading-6 text-[var(--fg-muted)]">{description}</div>
        ) : null}
      </div>
      <div className={classes('min-w-0 lg:justify-self-stretch', controlClassName)}>{children}</div>
    </div>
  )
}

export type SettingsStatusTone = 'ready' | 'attention' | 'danger' | 'neutral'

export type StatusPillProps = {
  label: string
  tone?: SettingsStatusTone
  icon?: LucideIcon
  className?: string
}

const STATUS_TONE_CLASS: Record<SettingsStatusTone, string> = {
  ready: 'border-[var(--ready)]/30 bg-[var(--ready)]/10 text-[var(--ready)]',
  attention: 'border-[var(--amber)]/30 bg-[var(--amber)]/10 text-[var(--amber)]',
  danger: 'border-[var(--danger-border)] bg-[var(--danger-fill)] text-[var(--danger)]',
  neutral: 'border-[var(--line)] bg-[var(--fill-1)] text-[var(--fg-muted)]',
}

export function StatusPill({ label, tone = 'neutral', icon: Icon, className }: StatusPillProps) {
  return (
    <span
      className={classes(
        'inline-flex min-h-7 w-fit shrink-0 items-center gap-1.5 rounded-[var(--r-pill)] border px-2.5 py-1 text-xs font-medium',
        STATUS_TONE_CLASS[tone],
        className,
      )}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  )
}

export type SettingsNavItem = {
  id: string
  label: string
  icon?: LucideIcon
  status?: ReactNode
}

export type SettingsNavProps = {
  items: readonly SettingsNavItem[]
  activeId?: string
  onNavigate?: (id: string) => void
  ariaLabel?: string
  className?: string
}

export function SettingsNav({
  items,
  activeId,
  onNavigate,
  ariaLabel = 'Listing settings sections',
  className,
}: SettingsNavProps) {
  const [internalActiveId, setInternalActiveId] = useState(() => activeId ?? items[0]?.id ?? '')
  const currentId = activeId ?? internalActiveId

  useEffect(() => {
    if (activeId !== undefined) return

    function syncFromHash() {
      const hash = decodeURIComponent(window.location.hash.slice(1))
      if (items.some((item) => item.id === hash)) setInternalActiveId(hash)
      else if (!hash) setInternalActiveId(items[0]?.id ?? '')
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [activeId, items])

  return (
    <nav
      aria-label={ariaLabel}
      className={classes(
        'flex max-w-full gap-1 overflow-x-auto rounded-[var(--radius)] border border-[var(--line-soft)] bg-[var(--glass)] p-1 backdrop-blur-[var(--blur-card)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:sticky lg:top-24 lg:block lg:space-y-1 lg:overflow-visible lg:p-2',
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === currentId
        return (
          <a
            key={item.id}
            href={`#${encodeURIComponent(item.id)}`}
            aria-current={active ? 'location' : undefined}
            onClick={() => {
              setInternalActiveId(item.id)
              onNavigate?.(item.id)
            }}
            className={classes(
              'flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius)] border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--control-focus)] focus-visible:ring-inset lg:w-full',
              active
                ? 'border-[var(--line)] bg-[var(--fill-2)] text-[var(--fg)]'
                : 'border-transparent text-[var(--fg-muted)] hover:bg-[var(--fill-1)] hover:text-[var(--fg)]',
            )}
          >
            {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
            <span className="whitespace-nowrap">{item.label}</span>
            {item.status ? <span className="ml-auto shrink-0">{item.status}</span> : null}
          </a>
        )
      })}
    </nav>
  )
}
