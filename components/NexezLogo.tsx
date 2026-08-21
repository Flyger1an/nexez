type BrandTone = 'black' | 'white' | 'theme'

type BrandAssetProps = {
  className?: string
  label?: string
  tone?: BrandTone
}

function BrandAsset({
  blackSrc,
  whiteSrc,
  className,
  label = 'Nexez',
  tone,
}: BrandAssetProps & { blackSrc: string; whiteSrc: string; tone: BrandTone }) {
  return (
    <span role="img" aria-label={label} className={`relative inline-block ${className ?? ''}`}>
      {tone !== 'white' ? (
        <img
          src={blackSrc}
          alt=""
          aria-hidden="true"
          className={`h-full w-full object-contain ${tone === 'theme' ? 'dark:hidden' : ''}`}
        />
      ) : null}
      {tone !== 'black' ? (
        <img
          src={whiteSrc}
          alt=""
          aria-hidden="true"
          className={`h-full w-full object-contain ${tone === 'theme' ? 'hidden dark:block' : ''}`}
        />
      ) : null}
    </span>
  )
}

// Compact supplied monogram. Defaults to the official black SVG because current
// product-chrome placements sit on white icon tiles.
export function NexezLogo({
  className = 'size-5',
  label = 'Nexez',
  tone = 'black',
}: BrandAssetProps) {
  return (
    <BrandAsset
      blackSrc="/nexez-monogram.svg"
      whiteSrc="/nexez-monogram-white.svg"
      className={className}
      label={label}
      tone={tone}
    />
  )
}

// Official supplied horizontal lockup. Marketing surfaces follow the active
// light/dark theme by switching between the supplied black and white SVG files.
export function NexezLockup({
  className = 'h-[17px] w-[102px]',
  label = 'Nexez',
  tone = 'theme',
}: BrandAssetProps) {
  return (
    <BrandAsset
      blackSrc="/nexez-logo.svg"
      whiteSrc="/nexez-logo-white.svg"
      className={className}
      label={label}
      tone={tone}
    />
  )
}
