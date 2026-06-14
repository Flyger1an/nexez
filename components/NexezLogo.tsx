// Nexez brand mark. The bold square PNG (public/nexez-logo.png) is used as a CSS
// mask filled with `currentColor`, so the mark takes the surrounding text color
// (black on the white chip in dark mode, white when the chip inverts in light
// mode) with no extra stylesheet rule. To update the logo, replace the PNG.
export function NexezLogo({ className = 'size-5' }: { className?: string }) {
  const mask = 'url(/nexez-logo.png) center / contain no-repeat'
  return (
    <span
      role="img"
      aria-label="Nexez"
      className={className}
      style={{
        display: 'inline-block',
        backgroundColor: 'currentColor',
        WebkitMask: mask,
        mask,
      }}
    />
  )
}
