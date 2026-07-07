// Nexez Seller Hub - "Ink & Ember" + Liquid Glass design system (handoff v2).
// Tokens from design_handoff_seller_hub (README + Seller Hub.dc.html).
// Legacy alias names (persimmon*/gold*/teal/…) map onto the new palette at the
// bottom so screens written against v1 keep compiling while adopting Ink & Ember.

export const colors = {
  // Canvas / surfaces (cool blue-ink)
  background: '#0a0e16', // app (phone) base
  backgroundDeep: '#070a0f', // radial outer stop
  backgroundGlow: '#101622', // radial inner stop (top glow)
  surface: '#11161f', // solid raised well (ring inner)
  surfaceDeep: '#0c1119',

  // Liquid Glass material (translucent - pair with a BlurView behind)
  glass: 'rgba(255,255,255,0.07)', // standard panel fill
  glassBorder: 'rgba(255,255,255,0.14)',
  glassRim: 'rgba(255,255,255,0.18)', // inset specular top rim = the "liquid" edge
  group: 'rgba(255,255,255,0.06)', // flat grouped lists
  groupBorder: 'rgba(255,255,255,0.12)',
  groupRim: 'rgba(255,255,255,0.15)',
  raised: 'rgba(255,255,255,0.09)', // raised rows / icon tiles
  raisedBorder: 'rgba(255,255,255,0.17)',
  stickyBg: 'rgba(16,22,34,0.55)', // sticky header glass
  inputBg: 'rgba(255,255,255,0.05)',
  inputBorder: 'rgba(255,255,255,0.14)',
  hairline: 'rgba(255,255,255,0.06)',

  // Brand - Ember (primary) + Steel (secondary / trust / money)
  ember: '#E45F38',
  emberText: '#F3865F', // text/icon inside glass ring buttons
  emberTint: '#F8A07F', // secondary highlight text, endpoint chips
  emberDeep: '#b7472a', // chart + avatar gradient end
  steel: '#7C93C4', // payouts, trust, secondary figures
  steelLight: '#9FB2DC',

  // Status
  success: '#6FD6A0',
  warning: '#ffd27a',
  danger: '#ff8c82',

  // Text
  text: '#f2f4f8',
  body: '#e8eaf0',
  textSecondary: 'rgba(255,255,255,0.5)',
  textTertiary: 'rgba(255,255,255,0.4)',
  textFaint: 'rgba(255,255,255,0.35)',
  label: 'rgba(255,255,255,0.42)',

  // Buttons
  ringBg: 'rgba(228,95,56,0.1)', // glass ember CTA
  ringBgStrong: 'rgba(228,95,56,0.22)', // active nav capsule
  ringBorder: 'rgba(228,95,56,0.6)',
  neutralBg: 'rgba(255,255,255,0.09)',
  neutralBorder: 'rgba(255,255,255,0.17)',

  onBrand: '#0a0e16', // dark text on the ember gradient
  white: '#ffffff',

  // ---- Legacy aliases (v1 names → Ink & Ember) ----
  persimmon: '#E45F38',
  persimmonLight: '#F3865F',
  persimmonText: '#F8A07F',
  persimmonDeep: '#b7472a',
  gold: '#7C93C4',
  goldLight: '#9FB2DC',
  teal: '#E45F38',
  purple: '#7C93C4',
  green: '#6FD6A0',
  amber: '#ffd27a',
  red: '#ff8c82',
  muted: 'rgba(255,255,255,0.5)',
  faint: 'rgba(255,255,255,0.4)',
  border: 'rgba(255,255,255,0.14)',
  borderStrong: 'rgba(255,255,255,0.2)',
  surface2: 'rgba(255,255,255,0.07)',
  glassStrong: 'rgba(255,255,255,0.09)',
  black: '#0a0e16',
}

export const fonts = {
  display: 'SpaceGrotesk_600SemiBold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemibold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtra: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
}

export const radii = {
  card: 18,
  cardLg: 22,
  cardSm: 16,
  control: 14,
  input: 13,
  tile: 12,
  pillSm: 9,
  pill: 999,
  nav: 40,
}

export const shadows = {
  card: { elevation: 6 },
  hero: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, shadowOffset: { width: 0, height: 22 }, elevation: 8 },
  nav: { shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 34, shadowOffset: { width: 0, height: 14 }, elevation: 16 },
  create: { shadowColor: '#E45F38', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12 },
}

export const spacing = { screen: 20, radius: 16, pill: 999 }

// Readiness → color thresholds (design: ≥80 ember, ≥60 warning, else danger).
export function readinessColor(score: number) {
  if (score >= 80) return colors.ember
  if (score >= 60) return colors.warning
  return colors.danger
}
