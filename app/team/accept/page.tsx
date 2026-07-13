import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '../../../utils/supabase/server'
import { AcceptInvite } from './AcceptInvite'

export const metadata: Metadata = {
  title: 'Accept invitation', // root template appends ' · Nexez'
  description: 'Accept your Nexez team invitation.',
}

export default async function AcceptInvitePage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Must be signed in with the invited email for the accept to match. Bounce through
  // login and come back. (Same-origin relative path → safe-redirect on /login allows it.)
  if (!user) redirect('/login?next=/team/accept')

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <AcceptInvite emailConfirmed={Boolean(user.email_confirmed_at)} />
    </main>
  )
}
