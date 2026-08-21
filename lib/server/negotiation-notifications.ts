import 'server-only'

import type { AgentNegotiation } from '../negotiations'
import { recoverBearerToken } from './bearer-token'
import { sendPushToEmail } from '../push'

export async function notifyBuyerOfNegotiationDecision(
  negotiation: Pick<AgentNegotiation, 'id' | 'buyer_email' | 'offer_name' | 'slug' | 'status_token_encrypted'> & {
    status_token?: string | null
  },
  action: string,
) {
  if (!negotiation.buyer_email) return

  const what = negotiation.offer_name || negotiation.slug || 'your request'
  const messages: Record<string, { title: string; body: string }> = {
    accept: { title: 'Offer accepted', body: `The seller accepted your offer on ${what}.` },
    counter: { title: 'New counter-offer', body: `The seller countered your offer on ${what}.` },
    reject: { title: 'Offer declined', body: `The seller declined your offer on ${what}.` },
    decline: { title: 'Offer declined', body: `The seller declined your offer on ${what}.` },
    clarify: { title: 'Seller needs clarification', body: `The seller asked a follow-up question about ${what}.` },
    resume: { title: 'Negotiation resumed', body: `The seller resumed the negotiation for ${what}.` },
  }
  const message = messages[action]
  if (!message) return

  await sendPushToEmail(negotiation.buyer_email, {
    ...message,
    data: {
      type: 'negotiation',
      negotiationId: negotiation.id,
      token: recoverBearerToken({
        encrypted: negotiation.status_token_encrypted,
        plaintext: negotiation.status_token,
      }),
      status: action,
    },
    category: 'orders',
  })
}
