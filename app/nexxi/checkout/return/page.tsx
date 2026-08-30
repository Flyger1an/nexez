import { CheckCircle2, CircleX, RotateCcw } from 'lucide-react'
import { NexxiCheckoutReturnBridge } from '../../../../components/NexxiCheckoutReturnBridge'

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function NexxiCheckoutReturnPage({ searchParams }: PageProps) {
  const params = await searchParams
  const status = first(params.status) === 'success' ? 'success' : 'cancelled'
  const sessionId = validSessionId(first(params.session_id))
  const kind = first(params.kind) === 'negotiation' ? 'negotiation' : ''
  const token = validToken(first(params.token))
  const deepLink = new URL('nexie://checkout-return')
  deepLink.searchParams.set('status', status)
  if (sessionId) deepLink.searchParams.set('session_id', sessionId)
  if (kind) deepLink.searchParams.set('kind', kind)
  if (token) deepLink.searchParams.set('token', token)

  const success = status === 'success'
  return (
    <main className="min-h-screen bg-[#090b10] text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12 text-center">
        <div className="card !p-8">
          <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-white/10">
            {success
              ? <CheckCircle2 className="size-9 text-[var(--ready)]" />
              : <CircleX className="size-9 text-zinc-400" />}
          </div>
          <p className="mt-6 text-sm font-medium text-[var(--signal)]">Nexxi checkout</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {success ? 'Checkout complete' : 'Checkout cancelled'}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-zinc-400">
            {success
              ? 'Return to Nexxi to open your native receipt and continue tracking the order.'
              : 'No new payment was completed. Return to Nexxi whenever you are ready to try again.'}
          </p>
          <div className="mt-7 flex justify-center">
            <NexxiCheckoutReturnBridge deepLink={deepLink.toString()} />
          </div>
          {!success ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-500">
              <RotateCcw className="size-3.5" />
              Your approval remains visible in the app.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function validSessionId(value: string): string {
  return /^cs_[A-Za-z0-9_]{8,250}$/.test(value) ? value : ''
}

function validToken(value: string): string {
  return /^[A-Za-z0-9._~-]{8,512}$/.test(value) ? value : ''
}
