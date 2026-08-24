import 'server-only'

import { cache } from 'react'
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { isPlatformAdmin } from './plan'
import { createClient } from '../../utils/supabase/server'

const getPlatformAdminViewer = cache(async () => {
  const host = (await headers()).get('host')
  const supabase = createClient(await cookies(), host)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, isAdmin: false }
  return {
    user,
    isAdmin: await isPlatformAdmin(supabase, user.id),
  }
})

export async function requirePlatformAdmin(nextPath: string) {
  const viewer = await getPlatformAdminViewer()
  if (!viewer.user) redirect(`/login?next=${encodeURIComponent(nextPath)}`)
  if (!viewer.isAdmin) notFound()
  return viewer.user
}
