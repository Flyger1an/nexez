import { useRouter } from 'expo-router'
import { Plus, Search } from 'lucide-react-native'
import * as WebBrowser from 'expo-web-browser'
import { useMemo, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { AppButton, Badge, EmptyState, ErrorState, Header, IconButton, LoadingState, Screen } from '@/src/components/ui'
import { formatDate } from '@/src/lib/format'
import { publicPageUrl } from '@/src/lib/config'
import { getOfferCount, getReadinessScore } from '@/src/lib/agent-page'
import { publishPage } from '@/src/lib/data'
import { useToast } from '@/src/components/Toast'
import { colors, fonts, radii, readinessColor } from '@/src/theme/colors'
import { useListingsBoard } from '@/src/hooks/useListings'

type Filter = 'all' | 'published' | 'draft'

export function ListingsScreen() {
  const router = useRouter()
  const { data, loading, refreshing, error, reload, refresh } = useListingsBoard()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')

  const pages = data?.pages ?? []
  const counts = useMemo(
    () => ({
      all: pages.length,
      published: pages.filter((p) => p.is_published).length,
      draft: pages.filter((p) => !p.is_published).length,
    }),
    [pages],
  )
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return pages.filter((p) => {
      if (filter === 'published' && !p.is_published) return false
      if (filter === 'draft' && p.is_published) return false
      if (q && !`${p.name} ${p.slug}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [pages, filter, query])

  if (loading) return <LoadingState label="Loading listings" />
  if (error || !data) return <ErrorState message={error || 'Listings unavailable.'} onRetry={reload} />

  async function toggle(id: string, value: boolean) {
    await publishPage(id, value)
    toast(value ? 'Listing published' : 'Listing unpublished', 'success')
    await reload()
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Header title="Listings" right={<IconButton icon={Plus} label="Create listing" tone="brand" onPress={() => router.push('/listing/create')} />} />

      <View style={styles.search}>
        <Search size={18} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search listings"
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.chips}>
        {(['all', 'published', 'draft'] as Filter[]).map((key) => {
          const active = filter === key
          return (
            <Pressable key={key} onPress={() => setFilter(key)} style={[styles.chip, active ? styles.chipActive : null]}>
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                {key === 'all' ? 'All' : key === 'published' ? 'Published' : 'Draft'} · {counts[key]}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {visible.length ? (
        visible.map((page) => {
          const readiness = getReadinessScore(page)
          const visits = data.visitsByPage.get(page.id) ?? 0
          return (
            <View key={page.id} style={styles.card}>
              <Pressable onPress={() => router.push({ pathname: '/listing/[id]', params: { id: page.id } })}>
                <View style={styles.cardHead}>
                  <Text style={styles.name} numberOfLines={1}>
                    {page.name}
                  </Text>
                  <Badge tone={page.is_published ? 'success' : 'muted'}>{page.is_published ? 'Published' : 'Draft'}</Badge>
                </View>
                <Text style={styles.slug}>nexez.app/{page.slug}</Text>
                <View style={styles.stats}>
                  <Stat label="Readiness" value={`${readiness}`} color={readinessColor(readiness)} />
                  <Stat label="Visits" value={visits.toLocaleString()} />
                  <Stat label="Offers" value={`${getOfferCount(page)}`} />
                  <Stat label="Updated" value={formatDate(page.updated_at || page.created_at)} align="right" small />
                </View>
              </Pressable>
              <View style={styles.actions}>
                <Pressable onPress={() => router.push({ pathname: '/listing/[id]', params: { id: page.id } })} style={[styles.actionBtn, { flex: 1 }]}>
                  <Text style={styles.actionText}>Manage</Text>
                </Pressable>
                <Pressable onPress={() => router.push({ pathname: '/listing/[id]/edit', params: { id: page.id } })} style={styles.actionBtn}>
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => void toggle(page.id, !page.is_published)}
                  style={[styles.actionBtn, page.is_published ? null : styles.publishBtn]}
                >
                  <Text style={[styles.actionText, page.is_published ? { color: colors.textSecondary } : { color: colors.persimmon }]}>
                    {page.is_published ? 'Unpublish' : 'Publish'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )
        })
      ) : (
        <>
          <EmptyState title={pages.length ? 'No matches' : 'No listings yet'} detail={pages.length ? 'Try a different filter or search.' : 'Create your first listing to give agents a clean surface to read.'} />
          {pages.length ? null : <AppButton full label="Create listing" icon={Plus} onPress={() => router.push('/listing/create')} />}
        </>
      )}
    </Screen>
  )
}

function Stat({ label, value, color, align, small }: { label: string; value: string; color?: string; align?: 'right'; small?: boolean }) {
  return (
    <View style={align === 'right' ? { marginLeft: 'auto', alignItems: 'flex-end' } : null}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[small ? styles.statValueSm : styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  )
}

const styles = {
  search: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 9,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radii.input,
    paddingHorizontal: 13,
    height: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 14, padding: 0 },
  chips: { flexDirection: 'row' as const, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.glassBorder },
  chipActive: { backgroundColor: 'rgba(255,106,51,0.16)', borderColor: 'rgba(255,106,51,0.3)' },
  chipText: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 12 },
  chipTextActive: { color: colors.persimmon, fontFamily: fonts.bodyBold },
  card: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radii.card, padding: 16 },
  cardHead: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, justifyContent: 'space-between' as const, gap: 10, marginBottom: 4 },
  name: { flex: 1, color: colors.text, fontFamily: fonts.bodyBold, fontSize: 16 },
  slug: { color: colors.textTertiary, fontFamily: fonts.mono, fontSize: 12, marginBottom: 13 },
  stats: { flexDirection: 'row' as const, gap: 18, marginBottom: 13 },
  statLabel: { color: colors.textTertiary, fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 3 },
  statValue: { color: colors.body, fontFamily: fonts.display, fontSize: 17 },
  statValueSm: { color: colors.textSecondary, fontFamily: fonts.bodySemibold, fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row' as const, gap: 8, borderTopWidth: 1, borderTopColor: colors.hairline, paddingTop: 12, marginTop: 0 },
  actionBtn: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.neutralBg, alignItems: 'center' as const, justifyContent: 'center' as const },
  publishBtn: { backgroundColor: 'rgba(255,106,51,0.16)' },
  actionText: { color: colors.body, fontFamily: fonts.bodyBold, fontSize: 12 },
}
