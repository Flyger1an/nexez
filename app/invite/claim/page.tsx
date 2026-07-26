import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { NexezLogo } from '../../../components/NexezLogo'
import { SELLER_GROWTH_INVITE_COOKIE } from '../../../lib/server/seller-growth-token'
import { createAdminClient, hasSupabaseAdminEnv } from '../../../utils/supabase/admin'
import { createClient } from '../../../utils/supabase/server'
import { ClaimInviteCard, type ClaimInviteMode } from './ClaimInviteCard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Claim your Launch pass | Nexez',
  robots: { index: false, follow: false },
}

type ClaimPageProps = {
  searchParams: Promise<{ state?: string }>
}

type InviteClaimRow = {
  inviter_business_name: string
  invitee_email: string
  status: string
  expires_at: string
  accepted_by_owner_id: string | null
}

export default async function ClaimInvitePage({ searchParams }: ClaimPageProps) {
  const params = await searchParams
  const cookieStore = await cookies()
  const tokenHash = cookieStore.get(SELLER_GROWTH_INVITE_COOKIE)?.value || ''
  const supabase = createClient(cookieStore)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let invite: InviteClaimRow | null = null
  if (hasSupabaseAdminEnv() && /^[a-f0-9]{64}$/.test(tokenHash)) {
    const { data } = await createAdminClient()
      .from('seller_growth_invites')
      .select('inviter_business_name, invitee_email, status, expires_at, accepted_by_owner_id')
      .eq('token_hash', tokenHash)
      .maybeSingle<InviteClaimRow>()
    invite = data
  }

  let mode: ClaimInviteMode = 'invalid'
  if (params.state === 'invalid' || !invite) {
    mode = 'invalid'
  } else if (invite.status === 'expired') {
    mode = 'expired'
  } else if (
    (invite.status === 'claimed' || invite.status === 'qualified')
    && invite.accepted_by_owner_id === user?.id
  ) {
    mode = 'already_claimed'
  } else if (invite.status !== 'pending') {
    mode = 'unavailable'
  } else if (!user) {
    mode = 'signed_out'
  } else if ((user.email || '').toLowerCase() !== invite.invitee_email) {
    mode = 'wrong_email'
  } else {
    mode = 'ready'
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col">
        <a href="/" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-white">
          <span className="flex size-8 items-center justify-center rounded-md border border-border bg-[var(--ov-04)]">
            <NexezLogo className="size-5" />
          </span>
          Nexez
        </a>
        <div className="flex flex-1 items-center justify-center py-10">
          <ClaimInviteCard
            mode={mode}
            inviterBusinessName={invite?.inviter_business_name}
            inviteeEmail={invite?.invitee_email}
            signedInEmail={user?.email || ''}
            expiresAt={invite?.expires_at}
          />
        </div>
      </div>
    </main>
  )
}
