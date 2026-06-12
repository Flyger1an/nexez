// Nexez brand mark (Liquid Glass design system §4): an "N" whose two verticals are
// `currentColor` (the structure) and whose diagonal is the prism gradient (the parse) —
// theme-aware by construction. Same `className` API as before, so every call site is
// unchanged. The gradient id is shared (identical definition) across instances.
export function NexezLogo({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" role="img" aria-label="Nexez" className={className}>
      <defs>
        <linearGradient id="nx-lgrad" x1="7" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--signal)" />
          <stop offset="0.55" stopColor="var(--ready)" />
          <stop offset="1" stopColor="var(--amber)" />
        </linearGradient>
      </defs>
      <path d="M7 25.5V6.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M25 25.5V6.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M7 6.5L25 25.5" stroke="url(#nx-lgrad)" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  )
}
