import { NextResponse } from 'next/server'
import { AgentPage, getBaseUrl, getReadinessScore } from '../../../lib/agent-page'
import { supabase } from '../../../lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || 'all'
  const q = (searchParams.get('q') || '').toLowerCase().trim()
  const minReadiness = Math.max(0, parseInt(searchParams.get('min_readiness') || '0', 10) || 0)

  const { data: pages } = await supabase
    .from('pages')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .returns<AgentPage[]>()

  let filtered = (pages ?? []).filter(p => {
    if (category === 'all') return true

    const ind = (p.industry || '').toLowerCase()
    const isConsumer = ['home', 'plumbing', 'cleaning', 'massage', 'fitness', 'wellness', 'pet', 'grooming', 'auto', 'detailing', 'beauty', 'medical', 'health', 'events'].some(k => ind.includes(k))

    if (category === 'consumer') return isConsumer
    if (category === 'professional') return !isConsumer
    return true
  })

  if (q) {
    filtered = filtered.filter(p =>
      [p.name, p.description, p.audience, p.location].some(v => v?.toLowerCase().includes(q))
    )
  }

  // Compute readiness then filter (Phase 2 support for min_readiness)
  const withReadiness = filtered.map(p => ({
    p,
    readiness: getReadinessScore({
      ...p,
      products: p.products ?? [],
      services: p.services ?? [],
      faqs: p.faqs ?? [],
      is_published: true,
    }),
  }))

  const ready = minReadiness > 0 ? withReadiness.filter(r => r.readiness >= minReadiness) : withReadiness

  const results = ready.map(({ p, readiness }) => ({
    name: p.name,
    slug: p.slug,
    description: p.description,
    url: `${getBaseUrl()}/${p.slug}`,
    agent_json_url: `${getBaseUrl()}/${p.slug}/agent.json`,
    readiness,
    industry: p.industry || null,
    location: p.location,
    audience: p.audience,
  }))

  return NextResponse.json({
    count: results.length,
    filters: { category, q: q || null, min_readiness: minReadiness || null },
    results,
  })
}