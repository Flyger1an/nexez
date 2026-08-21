import { z } from 'zod'

/**
 * Nexez's persisted negotiation convention is major units multiplied by 100.
 * It is intentionally distinct from a provider's smallest unit (for example,
 * JPY has no decimal minor unit). Naming both prevents accidental mixing.
 */
export const appMinorAmountSchema = z.number().int().nonnegative()
export const positiveAppMinorAmountSchema = z.number().int().min(1)
export const isoCurrencyCodeSchema = z.string().trim().toLowerCase().regex(/^[a-z]{3}$/)

export type AppMinorAmount = z.infer<typeof appMinorAmountSchema>
export type IsoCurrencyCode = z.infer<typeof isoCurrencyCodeSchema>

export const TRANSACTION_CHANNELS = [
  'agent_checkout',
  'acp',
  'ucp',
  'negotiation',
  'recurring_service',
  'staged_settlement',
  'reservable_resource',
  'provider_redirect',
  'unknown',
] as const

export type TransactionChannel = (typeof TRANSACTION_CHANNELS)[number]
