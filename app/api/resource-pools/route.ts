import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { enforceRateLimit } from '../../../lib/rate-limit'
import {
  validateResourcePoolDraft,
  validateResourceWindowDraft,
} from '../../../lib/resource-authoring'
import { createClient } from '../../../utils/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function authenticated() {
  const supabase = createClient(await cookies())
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function GET(request: Request) {
  const { supabase, user } = await authenticated()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const pageId = new URL(request.url).searchParams.get('pageId')?.trim() || ''
  if (!UUID_RE.test(pageId)) return NextResponse.json({ error: 'A valid pageId is required.' }, { status: 400 })
  const { data: pools, error } = await supabase
    .from('resource_pools')
    .select('id, page_id, resource_key, label, unit_label, kind, total_quantity, status, version, created_at, updated_at')
    .eq('page_id', pageId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const ids = (pools ?? []).map((pool) => pool.id)
  const windows = ids.length
    ? await supabase
      .from('resource_pool_windows')
      .select('id, pool_id, window_key, label, starts_at, ends_at, total_quantity, status, version, created_at, updated_at')
      .in('pool_id', ids)
      .order('starts_at', { ascending: true })
    : { data: [], error: null }
  if (windows.error) return NextResponse.json({ error: windows.error.message }, { status: 400 })
  return NextResponse.json({ pools: pools ?? [], windows: windows.data ?? [] })
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'resource-authoring', 40, 60_000)
  if (limited) return limited
  const { supabase, user } = await authenticated()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  if (body.type === 'pool') {
    const pageId = typeof body.pageId === 'string' ? body.pageId.trim() : ''
    if (!UUID_RE.test(pageId)) return NextResponse.json({ error: 'A valid pageId is required.' }, { status: 400 })
    const draft = validateResourcePoolDraft(body.pool)
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 })
    const { data, error } = await supabase.from('resource_pools').insert({
      owner_id: user.id,
      page_id: pageId,
      resource_key: draft.value.resourceKey,
      label: draft.value.label,
      unit_label: draft.value.unitLabel,
      kind: draft.value.kind,
      total_quantity: draft.value.totalQuantity,
      status: draft.value.status,
    }).select('id, page_id, resource_key, label, unit_label, kind, total_quantity, status, version').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '23505' ? 409 : 400 })
    return NextResponse.json({ ok: true, pool: data }, { status: 201 })
  }
  if (body.type === 'window') {
    const poolId = typeof body.poolId === 'string' ? body.poolId.trim() : ''
    if (!UUID_RE.test(poolId)) return NextResponse.json({ error: 'A valid poolId is required.' }, { status: 400 })
    const draft = validateResourceWindowDraft(body.window)
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 })
    const { data, error } = await supabase.from('resource_pool_windows').insert({
      pool_id: poolId,
      window_key: draft.value.windowKey,
      label: draft.value.label,
      starts_at: draft.value.startsAt,
      ends_at: draft.value.endsAt,
      total_quantity: draft.value.totalQuantity,
      status: draft.value.status,
    }).select('id, pool_id, window_key, label, starts_at, ends_at, total_quantity, status, version').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '23505' ? 409 : 400 })
    return NextResponse.json({ ok: true, window: data }, { status: 201 })
  }
  return NextResponse.json({ error: 'type must be pool or window.' }, { status: 400 })
}

export async function PATCH(request: Request) {
  const limited = await enforceRateLimit(request, 'resource-authoring', 40, 60_000)
  if (limited) return limited
  const { supabase, user } = await authenticated()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 })
  if (body.type === 'pool') {
    const draft = validateResourcePoolDraft(body.pool)
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 })
    const { data, error } = await supabase.from('resource_pools').update({
      resource_key: draft.value.resourceKey,
      label: draft.value.label,
      unit_label: draft.value.unitLabel,
      total_quantity: draft.value.totalQuantity,
      status: draft.value.status,
    }).eq('id', id).select('id, page_id, resource_key, label, unit_label, kind, total_quantity, status, version').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '23505' ? 409 : 400 })
    if (!data) return NextResponse.json({ error: 'Resource pool not found.' }, { status: 404 })
    return NextResponse.json({ ok: true, pool: data })
  }
  if (body.type === 'window') {
    const draft = validateResourceWindowDraft(body.window)
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 })
    const { data, error } = await supabase.from('resource_pool_windows').update({
      window_key: draft.value.windowKey,
      label: draft.value.label,
      total_quantity: draft.value.totalQuantity,
      status: draft.value.status,
    }).eq('id', id).select('id, pool_id, window_key, label, starts_at, ends_at, total_quantity, status, version').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === '23505' ? 409 : 400 })
    if (!data) return NextResponse.json({ error: 'Resource window not found.' }, { status: 404 })
    return NextResponse.json({ ok: true, window: data })
  }
  return NextResponse.json({ error: 'type must be pool or window.' }, { status: 400 })
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit(request, 'resource-authoring', 20, 60_000)
  if (limited) return limited
  const { supabase, user } = await authenticated()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 })
  const table = body.type === 'pool'
    ? 'resource_pools'
    : body.type === 'window'
      ? 'resource_pool_windows'
      : null
  if (!table) return NextResponse.json({ error: 'type must be pool or window.' }, { status: 400 })
  const { data, error } = await supabase.from(table).delete().eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })
  if (!data) return NextResponse.json({ error: 'Resource record not found.' }, { status: 404 })
  return NextResponse.json({ ok: true, deleted: id })
}
