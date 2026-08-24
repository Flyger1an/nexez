import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildCommerceAttentionSummary } from '../../../../lib/commerce-attention'
import { loadDashboardCommerceActions } from '../../../../lib/server/dashboard-commerce-actions'
import { createClient } from '../../../../utils/supabase/server'

const PRIVATE_NO_STORE = {
  'Cache-Control': 'private, no-store',
}

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401, headers: PRIVATE_NO_STORE },
    )
  }

  const result = await loadDashboardCommerceActions(supabase, user.id)
  return NextResponse.json(
    { attention: buildCommerceAttentionSummary(result) },
    { headers: PRIVATE_NO_STORE },
  )
}
