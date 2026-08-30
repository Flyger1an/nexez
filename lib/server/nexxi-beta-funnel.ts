import 'server-only'

import { summarizeNexxiBetaFunnel, type NexxiBetaEventRow, type NexxiBetaOrderRow } from '../nexxi-beta-funnel'
import { createAdminClient, hasSupabaseAdminEnv } from '../../utils/supabase/admin'

export async function getNexxiBetaFunnel(days = 30) {
  const safeDays = Math.min(90, Math.max(1, Math.round(days)))
  const since = new Date(Date.now() - safeDays * 86_400_000).toISOString()
  if (!hasSupabaseAdminEnv()) return { since, steps: summarizeNexxiBetaFunnel([], []), eventCount: 0 }

  const admin = createAdminClient()
  const [eventResult, orderResult] = await Promise.all([
    admin
      .from('nexxi_launch_events')
      .select('user_id,event_name,created_at,app_version,build_version')
      .eq('channel', 'beta')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    admin
      .from('checkout_orders')
      .select('buyer_reference,status,stripe_livemode,created_at')
      .eq('stripe_livemode', true)
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
  ])

  if (eventResult.error) throw eventResult.error
  if (orderResult.error) throw orderResult.error
  const events = (eventResult.data ?? []) as NexxiBetaEventRow[]
  const orders = (orderResult.data ?? []) as NexxiBetaOrderRow[]
  return { since, steps: summarizeNexxiBetaFunnel(events, orders), eventCount: events.length }
}
