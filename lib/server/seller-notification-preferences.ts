import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sellerNotificationCategory,
  sellerNotificationPreferenceColumn,
  sellerNotificationPreferencesFromRow,
  type MutableSellerNotificationCategory,
  type SellerNotificationEvent,
  type SellerNotificationPreferences,
  type SellerNotificationPreferencesRow,
} from '../seller-notification-policy'

export const SELLER_NOTIFICATION_PREFERENCES_SELECT = [
  'user_id',
  'negotiations_enabled',
  'integrations_enabled',
  'reviews_enabled',
  'marketing_enabled',
].join(',')

export async function loadSellerNotificationPreferences(
  db: SupabaseClient,
  userId: string,
): Promise<{ preferences: SellerNotificationPreferences; configured: boolean }> {
  const { data, error } = await db
    .from('seller_notification_preferences')
    .select(SELLER_NOTIFICATION_PREFERENCES_SELECT)
    .eq('user_id', userId)
    .maybeSingle<SellerNotificationPreferencesRow>()

  if (error) throw error
  return {
    preferences: sellerNotificationPreferencesFromRow(data),
    configured: Boolean(data),
  }
}
/**
 * Required transaction notices never depend on a preference read. Optional
 * notices default on for accounts without a row and fail closed when the policy
 * store cannot be read, so a known opt-out is never bypassed during an outage.
 */
export async function shouldDeliverSellerNotification(
  db: SupabaseClient,
  userId: string,
  event: SellerNotificationEvent,
): Promise<boolean> {
  const category = sellerNotificationCategory(event)
  if (category === 'transactions') return true

  const column = sellerNotificationPreferenceColumn(category as MutableSellerNotificationCategory)
  const { data, error } = await db
    .from('seller_notification_preferences')
    .select(column)
    .eq('user_id', userId)
    .maybeSingle<Record<typeof column, boolean>>()

  if (error) {
    console.warn('[push] seller notification preference lookup failed:', error.message)
    return false
  }
  return data?.[column] !== false
}
