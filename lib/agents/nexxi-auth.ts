import 'server-only'
import { cookies, headers } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createClient } from '../../utils/supabase/server'

// Shared auth for the Nexxi endpoints (the chat turn route + the orders route). A
// request authenticates either with a mobile bearer token (Authorization header) or a
// web session cookie; both resolve to a user-scoped (RLS-bound) Supabase client, so
// every read/write the agent performs stays confined to that buyer.

export type NexxiAuthResult =
  | { ok: true; user: User; db: SupabaseClient }
  | { ok: false; response: NextResponse }

function createMobileBearerClient(accessToken: string): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase public env for Nexxi mobile auth.')
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

/**
 * Authenticate a Nexxi request and return the user + a user-scoped Supabase client,
 * or a ready-to-return 401 response.
 */
export async function authenticateNexxiRequest(request: NextRequest): Promise<NexxiAuthResult> {
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  const cookieStore = await cookies()
  const host = (await headers()).get('host')
  const db = bearerToken ? createMobileBearerClient(bearerToken) : createClient(cookieStore, host)
  const {
    data: { user },
    error,
  } = bearerToken ? await db.auth.getUser(bearerToken) : await db.auth.getUser()

  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Sign in to use Nexxi.', code: 'auth_required' }, { status: 401 }),
    }
  }

  return { ok: true, user, db }
}
