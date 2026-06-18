import { cookies, headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { handleNexieTurn, type NexieApprovalInput, type NexieMode } from '../../../../lib/agents/nexie'
import { enforceRateLimit } from '../../../../lib/rate-limit'
import { createClient } from '../../../../utils/supabase/server'

export const maxDuration = 60

type NexieRequestBody = {
  message?: string
  threadId?: string | null
  mode?: NexieMode
  approval?: NexieApprovalInput | null
}

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, 'agents:nexie', 40, 60_000)
  if (limited) return limited

  let body: NexieRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const cookieStore = await cookies()
  const host = (await headers()).get('host')
  const supabase = bearerToken ? createMobileBearerClient(bearerToken) : createClient(cookieStore, host)
  const {
    data: { user },
    error: authError,
  } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json(
      {
        error: 'Sign in to use Nexie.',
        code: 'auth_required',
      },
      { status: 401 },
    )
  }

  if (!body.approval && (!body.message || body.message.trim().length === 0)) {
    return NextResponse.json({ error: 'Message is required unless approving an action.' }, { status: 400 })
  }

  try {
    const result = await handleNexieTurn({
      db: supabase,
      userId: user.id,
      message: body.message,
      threadId: body.threadId,
      mode: body.mode === 'voice' ? 'voice' : 'text',
      approval: body.approval ?? null,
    })

    return NextResponse.json({
      ok: true,
      ...result,
    })
  } catch (error) {
    console.error('[Nexie] agent turn failed', error)
    return NextResponse.json(
      {
        error: 'Nexie hit a snag before completing that turn.',
        detail: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}

function createMobileBearerClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase public env for Nexie mobile auth.')
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'nexie-agent',
    capabilities: ['voice_input', 'text_chat', 'search_pages', 'initiate_negotiation', 'trigger_booking', 'approval_flow', 'supabase_memory'],
  })
}
