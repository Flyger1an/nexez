import type { LucideIcon } from 'lucide-react-native'
import { ArrowLeft } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg'
import { colors, fonts, radii, readinessColor } from '@/src/theme/colors'

export type Tone = 'info' | 'success' | 'warn' | 'muted' | 'danger' | 'gold'

/* ------------------------------------------------------------------ */
/* Liquid Glass primitive — BlurView + translucent fill + specular rim */
/* ------------------------------------------------------------------ */

type GlassTone = 'card' | 'group' | 'raised' | 'sticky'
const GLASS = {
  card: { fill: colors.glass, border: colors.glassBorder, rim: colors.glassRim, intensity: 26 },
  group: { fill: colors.group, border: colors.groupBorder, rim: colors.groupRim, intensity: 22 },
  raised: { fill: colors.raised, border: colors.raisedBorder, rim: colors.glassRim, intensity: 30 },
  sticky: { fill: colors.stickyBg, border: 'transparent', rim: 'rgba(255,255,255,0.08)', intensity: 40 },
} as const

export function Glass({
  children,
  style,
  contentStyle,
  tone = 'card',
  radius = radii.card,
}: {
  children?: React.ReactNode
  style?: object
  contentStyle?: object
  tone?: GlassTone
  radius?: number
}) {
  const t = GLASS[tone]
  return (
    <View style={[{ borderRadius: radius, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }, style]}>
      <BlurView intensity={t.intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: t.fill }]} />
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: t.rim }} />
      <View style={contentStyle}>{children}</View>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Screen + chrome                                                    */
/* ------------------------------------------------------------------ */

function TopGlow() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="0%" rx="85%" ry="42%">
          <Stop offset="0" stopColor={colors.backgroundGlow} stopOpacity={1} />
          <Stop offset="1" stopColor={colors.background} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
    </Svg>
  )
}

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  header,
}: {
  children: React.ReactNode
  scroll?: boolean
  refreshing?: boolean
  onRefresh?: () => void
  header?: React.ReactNode
}) {
  const body = <View style={styles.body}>{children}</View>
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <TopGlow />
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.ember} colors={[colors.ember]} progressBackgroundColor={colors.surface} />
            ) : undefined
          }
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
    </SafeAreaView>
  )
}

export function Header({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <Text style={styles.greeting}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  )
}

/* Fixed back-header for overlay (drill-down) screens — sticky glass. */
export function StackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.stackHeaderWrap}>
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.stickyBg }]} />
      <View pointerEvents="none" style={styles.stickyRim} />
      <View style={styles.stackHeader}>
        <Pressable onPress={onBack} accessibilityLabel="Back" style={({ pressed }) => [styles.backBtn, pressed ? styles.pressed : null]}>
          <ArrowLeft size={22} color={colors.body} />
        </Pressable>
        <Text style={styles.stackTitle} numberOfLines={1}>
          {title}
        </Text>
        {right}
      </View>
    </View>
  )
}

/* Gradient square avatar with a dark initial (ember → ember-deep). */
export function AvatarChip({ initial, size = 42 }: { initial: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.33, overflow: 'hidden' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="avatar" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.ember} />
            <Stop offset="1" stopColor={colors.emberDeep} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill="url(#avatar)" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontFamily: fonts.display, color: colors.white, fontSize: size * 0.38 }}>{initial}</Text>
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Containers                                                          */
/* ------------------------------------------------------------------ */

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Glass tone="card" radius={radii.card} contentStyle={[styles.cardContent, style]}>
      {children}
    </Glass>
  )
}

export function GroupCard({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Glass tone="group" radius={radii.card} style={style}>
      {children}
    </Glass>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {action}
    </View>
  )
}
export const SectionLabel = SectionTitle

/* ------------------------------------------------------------------ */
/* Metrics                                                            */
/* ------------------------------------------------------------------ */

export function MetricCard({
  label,
  value,
  detail,
  delta,
  icon: Icon,
  tone = 'info',
}: {
  label: string
  value: string | number
  detail?: string
  delta?: string
  icon?: LucideIcon
  tone?: Tone
}) {
  return (
    <Glass tone="card" radius={radii.card} style={styles.metric} contentStyle={styles.metricContent}>
      <View style={styles.metricTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        {Icon ? <Icon size={15} color={toneColor(tone)} /> : null}
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      {delta ? <Text style={[styles.metricDelta, { color: toneColor(tone === 'muted' ? 'info' : tone) }]}>{delta}</Text> : null}
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </Glass>
  )
}

export function TrafficSplit({ aiPct, total }: { aiPct: number; total?: string }) {
  const pct = Math.max(0, Math.min(100, aiPct))
  return (
    <View>
      {total ? (
        <View style={styles.splitHead}>
          <Text style={styles.sectionLabel}>AI vs human traffic</Text>
          <Text style={styles.splitTotal}>{total}</Text>
        </View>
      ) : null}
      <View style={styles.splitTrack}>
        <View style={{ width: `${pct}%`, backgroundColor: colors.ember, borderRadius: 6 }} />
        <View style={{ flex: 1, backgroundColor: 'rgba(124,147,196,0.5)', borderRadius: 6 }} />
      </View>
      <View style={styles.splitLegend}>
        <Text style={[styles.splitLegendText, { color: colors.ember }]}>{pct}% AI agents</Text>
        <Text style={[styles.splitLegendText, { color: colors.textSecondary }]}>{100 - pct}% human</Text>
      </View>
    </View>
  )
}

export function ReadinessRing({ score, size = 74, stroke = 7, showOutOf = false }: { score: number; size?: number; stroke?: number; showOutOf?: boolean }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, score))
  const color = readinessColor(score)
  const well = size - stroke * 2 - 6
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - pct / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ width: well, height: well, borderRadius: well / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.display, color, fontSize: size * 0.3 }}>{score}</Text>
        {showOutOf ? <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: -2 }}>/ 100</Text> : null}
      </View>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Pills / badges / skeleton                                          */
/* ------------------------------------------------------------------ */

export function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <View style={[styles.badge, { borderColor: toneBorder(tone), backgroundColor: toneBg(tone) }]}>
      <Text style={[styles.badgeText, { color: toneColor(tone) }]}>{children}</Text>
    </View>
  )
}
export const Pill = Badge

export function Mono({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[styles.mono, style]}>{children}</Text>
}

/* Pulsing skeleton block (nxpulse) for loading states. */
export function Skeleton({ height = 16, width, radius = 10, style }: { height?: number; width?: number | string; radius?: number; style?: object }) {
  const pulse = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])
  return <Animated.View style={[{ height, width: (width as number) ?? '100%', borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.08)', opacity: pulse }, style]} />
}

/* ------------------------------------------------------------------ */
/* Buttons                                                            */
/* ------------------------------------------------------------------ */

export function AppButton({
  label,
  onPress,
  icon: Icon,
  variant = 'primary',
  disabled,
  full,
}: {
  label: string
  onPress?: () => void
  icon?: LucideIcon
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  full?: boolean
}) {
  const buttonStyle = variant === 'primary' ? styles.primaryButton : variant === 'danger' ? styles.dangerButton : variant === 'ghost' ? styles.ghostButton : styles.secondaryButton
  const textColor = variant === 'primary' ? colors.emberText : variant === 'danger' ? colors.danger : colors.body
  const iconColor = variant === 'primary' ? colors.ember : variant === 'danger' ? colors.danger : colors.body
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.button, buttonStyle, full ? { alignSelf: 'stretch', flex: undefined } : null, disabled ? styles.disabled : pressed ? styles.pressed : null]}>
      {Icon ? <Icon size={17} color={iconColor} /> : null}
      <Text style={[styles.buttonText, { color: textColor }]}>{label}</Text>
    </Pressable>
  )
}

export function IconButton({ icon: Icon, onPress, label, tone = 'neutral' }: { icon: LucideIcon; onPress?: () => void; label: string; tone?: 'neutral' | 'brand' }) {
  const brand = tone === 'brand'
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconButton, brand ? { backgroundColor: colors.ringBg, borderColor: colors.ringBorder } : null, pressed ? styles.pressed : null]}>
      <Icon size={20} color={brand ? colors.ember : colors.body} />
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export function ListRow({ title, detail, right, icon: Icon, iconTone = 'brand', onPress }: { title: string; detail?: string; right?: React.ReactNode; icon?: LucideIcon; iconTone?: 'brand' | 'gold' | 'muted'; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && onPress ? styles.pressed : null]}>
      <Glass tone="card" radius={radii.cardSm} contentStyle={styles.rowContent}>
        <RowInner title={title} detail={detail} right={right} icon={Icon} iconTone={iconTone} />
      </Glass>
    </Pressable>
  )
}

export function GroupRow({ title, detail, right, icon: Icon, iconTone = 'brand', onPress, last }: { title: string; detail?: string; right?: React.ReactNode; icon?: LucideIcon; iconTone?: 'brand' | 'gold' | 'muted'; onPress?: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.groupRow, last ? null : styles.rowDivider, pressed && onPress ? styles.pressed : null]}>
      <RowInner title={title} detail={detail} right={right} icon={Icon} iconTone={iconTone} />
    </Pressable>
  )
}

function RowInner({ title, detail, right, icon: Icon, iconTone = 'brand' }: { title: string; detail?: string; right?: React.ReactNode; icon?: LucideIcon; iconTone?: 'brand' | 'gold' | 'muted' }) {
  const tint = iconTone === 'gold' ? colors.steel : iconTone === 'muted' ? colors.textSecondary : colors.ember
  return (
    <>
      {Icon ? (
        <View style={[styles.rowIcon, { backgroundColor: iconTone === 'muted' ? colors.neutralBg : 'rgba(228,95,56,0.12)' }]}>
          <Icon size={18} color={tint} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {right}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Inputs / controls                                                  */
/* ------------------------------------------------------------------ */

export function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
    </View>
  )
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  mono,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  multiline?: boolean
  secureTextEntry?: boolean
  keyboardType?: 'default' | 'email-address' | 'url'
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  mono?: boolean
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.textTertiary} multiline={multiline} secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} style={[styles.input, mono ? { fontFamily: fonts.mono, fontSize: 14 } : null, multiline ? styles.textarea : null]} />
    </View>
  )
}

export function ToggleRow({ label, detail, value, onValueChange }: { label: string; detail?: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: 'rgba(255,255,255,0.15)', true: colors.ember }} thumbColor={colors.white} ios_backgroundColor="rgba(255,255,255,0.15)" />
    </View>
  )
}

export function SegmentedControl<T extends string>({ value, options, onChange }: { value: T; options: Array<{ label: string; value: T }>; onChange: (value: T) => void }) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.segment, active ? styles.segmentActive : null]}>
            <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <Screen scroll={false}>
      <View style={styles.centerState}>
        <ActivityIndicator color={colors.ember} />
        <Text style={styles.stateText}>{label}</Text>
      </View>
    </Screen>
  )
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <Card style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {detail ? <Text style={styles.emptyDetail}>{detail}</Text> : null}
    </Card>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Screen>
      <Card>
        <Text style={styles.emptyTitle}>Something needs attention</Text>
        <Text style={styles.emptyDetail}>{message}</Text>
        {onRetry ? <AppButton label="Retry" onPress={onRetry} variant="secondary" /> : null}
      </Card>
    </Screen>
  )
}

/* ------------------------------------------------------------------ */
/* Tone helpers                                                        */
/* ------------------------------------------------------------------ */

function toneColor(tone: string) {
  if (tone === 'success') return colors.success
  if (tone === 'warn') return colors.warning
  if (tone === 'danger') return colors.danger
  if (tone === 'gold') return colors.steel
  if (tone === 'info') return colors.ember
  return colors.textSecondary
}
function toneBg(tone: string) {
  if (tone === 'success') return 'rgba(111,214,160,0.13)'
  if (tone === 'warn') return 'rgba(255,210,122,0.12)'
  if (tone === 'danger') return 'rgba(255,140,130,0.12)'
  if (tone === 'gold') return 'rgba(124,147,196,0.16)'
  if (tone === 'info') return 'rgba(228,95,56,0.14)'
  return 'rgba(255,255,255,0.07)'
}
function toneBorder(tone: string) {
  if (tone === 'success') return 'rgba(111,214,160,0.3)'
  if (tone === 'warn') return 'rgba(255,210,122,0.3)'
  if (tone === 'danger') return 'rgba(255,140,130,0.3)'
  if (tone === 'gold') return 'rgba(124,147,196,0.32)'
  if (tone === 'info') return 'rgba(228,95,56,0.3)'
  return colors.glassBorder
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

export const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 120 },
  body: { flex: 1, gap: 16, paddingHorizontal: 20, paddingTop: 8 },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  greeting: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 13, marginBottom: 4 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 26, letterSpacing: -0.3 },
  subtitle: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 5 },

  stackHeaderWrap: { overflow: 'hidden' },
  stickyRim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  stackHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.neutralBg, borderWidth: 1, borderColor: colors.neutralBorder, alignItems: 'center', justifyContent: 'center' },
  stackTitle: { flex: 1, color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 },

  cardContent: { padding: 16, gap: 10 },

  metric: { flex: 1, minWidth: 150 },
  metricContent: { padding: 15 },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  metricLabel: { color: colors.label, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  metricValue: { color: colors.text, fontFamily: fonts.display, fontSize: 28 },
  metricDelta: { fontFamily: fonts.bodySemibold, fontSize: 12, marginTop: 3 },
  metricDetail: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 12, marginTop: 3 },

  splitHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  splitTotal: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12 },
  splitTrack: { flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2 },
  splitLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  splitLegendText: { fontFamily: fonts.bodyBold, fontSize: 12 },

  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  mono: { fontFamily: fonts.mono, color: colors.textTertiary, fontSize: 12 },

  button: { minHeight: 46, borderRadius: radii.control, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  primaryButton: { backgroundColor: colors.ringBg, borderWidth: 1, borderColor: colors.ringBorder },
  secondaryButton: { backgroundColor: colors.neutralBg, borderWidth: 1, borderColor: colors.neutralBorder },
  ghostButton: { backgroundColor: 'transparent' },
  dangerButton: { backgroundColor: 'rgba(255,140,130,0.12)', borderWidth: 1, borderColor: 'rgba(255,140,130,0.32)' },
  buttonText: { fontFamily: fonts.bodyBold, fontSize: 14 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },

  iconButton: { width: 42, height: 42, borderRadius: radii.tile, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.neutralBg, alignItems: 'center', justifyContent: 'center' },

  rowContent: { minHeight: 60, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', gap: 12, alignItems: 'center' },
  groupRow: { minHeight: 56, paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  rowDetail: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, marginTop: 2 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 2 },
  sectionLabel: { color: colors.label, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase' },

  progressTrack: { height: 7, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: colors.ember, borderRadius: 4 },

  field: { gap: 7 },
  fieldLabel: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 12 },
  input: { minHeight: 48, borderRadius: radii.input, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.inputBg, color: colors.text, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15 },
  textarea: { minHeight: 110, paddingTop: 13, textAlignVertical: 'top' },

  toggleRow: { minHeight: 60, borderRadius: radii.control, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },

  segmented: { flexDirection: 'row', padding: 4, borderRadius: radii.input, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.inputBg, gap: 4 },
  segment: { flex: 1, minHeight: 34, borderRadius: radii.pillSm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 1, borderColor: 'transparent' },
  segmentActive: { backgroundColor: colors.ringBgStrong, borderColor: 'rgba(228,95,56,0.55)' },
  segmentText: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 12 },
  segmentTextActive: { color: colors.emberText },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 14 },
  empty: { alignItems: 'flex-start' },
  emptyTitle: { color: colors.text, fontFamily: fonts.bodyExtra, fontSize: 16 },
  emptyDetail: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
})
