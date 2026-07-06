import { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Card, EmptyState, ErrorState, Header, LoadingState, MetricCard, Screen, SectionTitle } from '@/src/components/ui'
import { compactNumber, formatCurrency } from '@/src/lib/format'
import { colors, fonts, radii } from '@/src/theme/colors'
import { useAnalytics } from '@/src/hooks/useAnalytics'

type Range = '24h' | '7d' | '30d' | '90d'
const RANGE_DAYS: Record<Range, number> = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }
const DAY = 86400000

export function AnalyticsScreen() {
  const { data, loading, refreshing, error, reload, refresh } = useAnalytics()
  const [range, setRange] = useState<Range>('7d')

  const stats = useMemo(() => {
    if (!data) return null
    const now = Date.now()
    const cutoff = now - RANGE_DAYS[range] * DAY
    const ts = (v: string) => new Date(v).getTime()
    const visits = data.visits.filter((v) => ts(v.created_at) >= cutoff)
    const events = data.events.filter((e) => ts(e.created_at) >= cutoff)
    const ai = visits.filter((v) => v.is_ai_agent)
    const human = visits.filter((v) => !v.is_ai_agent)
    const conversions = events.filter((e) => e.event_type === 'stripe_session_created' && e.metadata?.dry_run !== true)
    const pipelineCents = conversions.reduce((s, e) => s + Number(e.metadata?.amount_cents || 0), 0)
    const rate = ai.length ? (conversions.length / ai.length) * 100 : 0

    // 7-day stacked chart (always last 7 calendar days)
    const days = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(now - (6 - i) * DAY)
      dayStart.setHours(0, 0, 0, 0)
      const start = dayStart.getTime()
      const end = start + DAY
      const inDay = data.visits.filter((v) => ts(v.created_at) >= start && ts(v.created_at) < end)
      return {
        label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dayStart.getDay()],
        ai: inDay.filter((v) => v.is_ai_agent).length,
        human: inDay.filter((v) => !v.is_ai_agent).length,
      }
    })
    const maxDay = Math.max(1, ...days.map((d) => d.ai + d.human))

    const byType = new Map<string, number>()
    for (const v of ai) byType.set(v.agent_type || 'Unknown', (byType.get(v.agent_type || 'Unknown') ?? 0) + 1)
    const topAgents = [...byType.entries()].map(([name, n]) => ({ name, n, pct: Math.round((n / Math.max(1, ai.length)) * 100) })).sort((a, b) => b.n - a.n).slice(0, 5)

    const byPage = new Map<string, number>()
    for (const v of ai) byPage.set(v.page_id, (byPage.get(v.page_id) ?? 0) + 1)
    const topPages = [...byPage.entries()]
      .map(([id, n]) => ({ name: data.pages.find((p) => p.id === id)?.name || 'Unknown listing', n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 5)

    const byQuery = new Map<string, number>()
    for (const v of visits) if (v.query) byQuery.set(v.query, (byQuery.get(v.query) ?? 0) + 1)
    const topQueries = [...byQuery.entries()].map(([q, n]) => ({ q, n })).sort((a, b) => b.n - a.n).slice(0, 4)

    return { ai, human, conversions, pipelineCents, rate, days, maxDay, topAgents, topPages, topQueries }
  }, [data, range])

  if (loading) return <LoadingState label="Loading analytics" />
  if (error || !data || !stats) return <ErrorState message={error || 'Analytics unavailable.'} onRetry={reload} />

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Analytics" />

      <View style={st.ranges}>
        {(['24h', '7d', '30d', '90d'] as Range[]).map((r) => {
          const active = range === r
          return (
            <Pressable key={r} onPress={() => setRange(r)} style={[st.range, active ? st.rangeActive : null]}>
              <Text style={[st.rangeText, active ? st.rangeTextActive : null]}>{r === '24h' ? '24h' : r === '7d' ? '7 days' : r}</Text>
            </Pressable>
          )
        })}
      </View>

      <View style={st.heroRow}>
        <View style={[st.hero, { backgroundColor: 'rgba(255,106,51,0.12)', borderColor: 'rgba(255,106,51,0.22)' }]}>
          <Text style={st.heroLabel}>Pipeline · {range}</Text>
          <Text style={st.heroValue}>{formatCurrency(stats.pipelineCents)}</Text>
        </View>
        <View style={[st.hero, { backgroundColor: 'rgba(233,162,59,0.12)', borderColor: 'rgba(233,162,59,0.22)' }]}>
          <Text style={st.heroLabel}>Conversions · {range}</Text>
          <Text style={st.heroValue}>{stats.conversions.length}</Text>
        </View>
      </View>

      <Card>
        <Text style={st.eyebrow}>Visits over time · 7d</Text>
        <View style={st.chart}>
          {stats.days.map((d, i) => {
            const aiH = Math.round((d.ai / stats.maxDay) * 78)
            const huH = Math.round((d.human / stats.maxDay) * 78)
            return (
              <View key={i} style={st.col}>
                <View style={st.bars}>
                  {aiH > 0 ? <View style={{ height: aiH, width: '100%', backgroundColor: colors.persimmon, borderRadius: 3 }} /> : null}
                  {huH > 0 ? <View style={{ height: huH, width: '100%', backgroundColor: 'rgba(233,162,59,0.45)', borderRadius: 3, marginTop: 2 }} /> : null}
                  {aiH + huH === 0 ? <View style={{ height: 3, width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3 }} /> : null}
                </View>
                <Text style={st.colLabel}>{d.label}</Text>
              </View>
            )
          })}
        </View>
        <View style={st.legend}>
          <Legend color={colors.persimmon} label="AI agents" />
          <Legend color="rgba(233,162,59,0.55)" label="Human" />
        </View>
      </Card>

      <View style={st.grid}>
        <MetricCard label="Agent visits" value={compactNumber(stats.ai.length)} tone="info" />
        <MetricCard label="Human visits" value={compactNumber(stats.human.length)} tone="muted" />
        <MetricCard label="Conversions" value={compactNumber(stats.conversions.length)} tone="success" />
        <MetricCard label="Conv. rate" value={`${stats.rate.toFixed(1)}%`} tone="info" />
      </View>

      <Card>
        <Text style={st.eyebrow}>Top buyer agents</Text>
        {stats.topAgents.length ? (
          stats.topAgents.map((t) => (
            <View key={t.name} style={{ marginTop: 11 }}>
              <View style={st.barHead}>
                <Text style={st.barName}>{t.name}</Text>
                <Text style={st.barPct}>{t.pct}%</Text>
              </View>
              <View style={st.barTrack}>
                <View style={{ height: 7, width: `${t.pct}%`, backgroundColor: colors.persimmon, borderRadius: 4 }} />
              </View>
            </View>
          ))
        ) : (
          <Text style={st.muted}>No agent traffic in this range.</Text>
        )}
      </Card>

      <Card>
        <Text style={st.eyebrow}>Top listings</Text>
        {stats.topPages.length ? (
          stats.topPages.map((p, i) => (
            <View key={i} style={[st.listRow, i < stats.topPages.length - 1 ? st.listDivider : null]}>
              <Text style={st.listName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={st.listNum}>{p.n.toLocaleString()}</Text>
            </View>
          ))
        ) : (
          <Text style={st.muted}>No ranked listings yet.</Text>
        )}
      </Card>

      {stats.topQueries.length ? (
        <Card>
          <Text style={st.eyebrow}>Top agent queries</Text>
          {stats.topQueries.map((q, i) => (
            <View key={i} style={[st.listRow, i < stats.topQueries.length - 1 ? st.listDivider : null]}>
              <Text style={st.query} numberOfLines={1}>
                “{q.q}”
              </Text>
              <Text style={st.listNum}>{q.n}</Text>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState title="No agent queries yet" detail="Queries appear once buyer agents search your listings." />
      )}
    </Screen>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: color }} />
      <Text style={st.legendText}>{label}</Text>
    </View>
  )
}

const st = {
  ranges: { flexDirection: 'row' as const, gap: 8 },
  range: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 10, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.glassBorder },
  rangeActive: { backgroundColor: 'rgba(255,106,51,0.16)', borderColor: 'rgba(255,106,51,0.3)' },
  rangeText: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 12 },
  rangeTextActive: { color: colors.persimmon, fontFamily: fonts.bodyBold },
  heroRow: { flexDirection: 'row' as const, gap: 12 },
  hero: { flex: 1, borderWidth: 1, borderRadius: radii.card, padding: 16 },
  heroLabel: { color: colors.textSecondary, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 6 },
  heroValue: { color: colors.text, fontFamily: fonts.display, fontSize: 24 },
  eyebrow: { color: colors.label, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' as const },
  chart: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, justifyContent: 'space-between' as const, height: 100, gap: 6, marginTop: 6 },
  col: { flex: 1, alignItems: 'center' as const, gap: 6, height: '100%' as const, justifyContent: 'flex-end' as const },
  bars: { width: '100%' as const, justifyContent: 'flex-end' as const, height: 82 },
  colLabel: { color: colors.textFaint, fontFamily: fonts.bodySemibold, fontSize: 9 },
  legend: { flexDirection: 'row' as const, gap: 16, marginTop: 4 },
  legendText: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 11 },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 },
  barHead: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: 5 },
  barName: { color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 12 },
  barPct: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 12 },
  barTrack: { height: 7, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' as const },
  listRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 9 },
  listDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  listName: { flex: 1, color: colors.body, fontFamily: fonts.bodySemibold, fontSize: 13 },
  listNum: { color: colors.textSecondary, fontFamily: fonts.mono, fontSize: 13 },
  query: { flex: 1, color: colors.body, fontFamily: fonts.body, fontSize: 13 },
  muted: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13, marginTop: 8 },
}
