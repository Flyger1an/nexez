import { useLocalSearchParams, useRouter } from 'expo-router'
import { Save } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { AppButton, Card, ErrorState, LoadingState, Screen, StackHeader, TextField } from '@/src/components/ui'
import { formatOfferLines, parseOfferLines } from '@/src/lib/agent-page'
import { updatePage } from '@/src/lib/data'
import { colors, fonts } from '@/src/theme/colors'
import { useListing } from '@/src/hooks/useListings'

export function OffersScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: page, loading, error, reload } = useListing(id)
  const [services, setServices] = useState('')
  const [products, setProducts] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!page) return
    setServices(formatOfferLines(page.services))
    setProducts(formatOfferLines(page.products))
  }, [page])

  if (loading) return <LoadingState label="Loading offers" />
  if (error || !page) return <ErrorState message={error || 'Listing not found.'} onRetry={reload} />
  const current = page

  async function save() {
    setSaving(true)
    setMessage('')
    try {
      await updatePage(current.id, { ...current, services: parseOfferLines(services), products: parseOfferLines(products) })
      router.back()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save offers.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen header={<StackHeader title="Offers" onBack={() => router.back()} />}>
      <Card>
        <Text style={st.hint}>One offer per line, in the format:</Text>
        <Text style={st.format}>Name | Price | Description | URL</Text>
      </Card>
      <TextField label="Services" value={services} onChangeText={setServices} multiline placeholder="Brand Sprint | $6,500 | 3-week identity | https://…" />
      <TextField label="Products" value={products} onChangeText={setProducts} multiline placeholder="Template Pack | $99 | Instant download | https://…" />
      {message ? <Text style={st.error}>{message}</Text> : null}
      <AppButton full label={saving ? 'Saving…' : 'Save offers'} icon={Save} disabled={saving} onPress={save} />
    </Screen>
  )
}

const st = {
  hint: { color: colors.textSecondary, fontFamily: fonts.body, fontSize: 13 },
  format: { color: colors.persimmonText, fontFamily: fonts.mono, fontSize: 13 },
  error: { color: colors.warning, fontFamily: fonts.body, fontSize: 13 },
}
