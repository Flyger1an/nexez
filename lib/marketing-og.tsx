import { ImageResponse } from 'next/og'

type OgAccent = 'signal' | 'ready' | 'amber'

const accentColor: Record<OgAccent, string> = {
  signal: '#FF6A33',
  ready: '#5FEAD3',
  amber: '#FFD9A8',
}

export const marketingOgSize = {
  width: 1200,
  height: 630,
}

export function renderMarketingOg({
  eyebrow,
  title,
  accent,
  accentTone,
}: {
  eyebrow: string
  title: string
  accent: string
  accentTone: OgAccent
}) {
  const color = accentColor[accentTone]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#050507',
          color: '#FAFAFA',
          padding: 64,
          fontFamily: 'Inter, Arial, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 580,
            height: 580,
            left: -180,
            top: -220,
            borderRadius: 999,
            background: color,
            opacity: 0.28,
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 460,
            height: 460,
            right: -150,
            bottom: -170,
            borderRadius: 999,
            background: '#5FEAD3',
            opacity: 0.16,
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 32,
            padding: 48,
            background: 'rgba(255,255,255,0.035)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: color,
                }}
              />
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1.2 }}>nexez</div>
            </div>
            <div
              style={{
                fontSize: 20,
                color: '#A1A1AA',
                letterSpacing: 2.8,
                textTransform: 'uppercase',
              }}
            >
              {eyebrow}
            </div>
          </div>

          <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 78,
                lineHeight: 0.96,
                fontWeight: 750,
                letterSpacing: -5.2,
              }}
            >
              {title}
            </div>
            <div
              style={{
                marginTop: 14,
                fontSize: 70,
                lineHeight: 0.98,
                fontWeight: 750,
                letterSpacing: -4.6,
                color,
              }}
            >
              {accent}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', color: '#A1A1AA', fontSize: 24 }}>
            <div style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
            Listings built for AI agents to discover, understand, and act.
          </div>
        </div>
      </div>
    ),
    marketingOgSize,
  )
}
