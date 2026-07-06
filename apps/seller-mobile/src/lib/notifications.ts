import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function registerForPushNotifications(userId: string, email: string | null) {
  if (Platform.OS === 'web') {
    return { ok: false, message: 'Push registration is available in iOS and Android builds.' }
  }

  const Device = await import('expo-device')
  const Notifications = await import('expo-notifications')

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  })

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('seller-events', {
      name: 'Seller events',
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  if (!Device.isDevice) {
    return { ok: false, message: 'Push notifications need a physical device.' }
  }

  const existing = await Notifications.getPermissionsAsync()
  const finalStatus =
    existing.status === 'granted' ? existing.status : (await Notifications.requestPermissionsAsync()).status

  if (finalStatus !== 'granted') {
    return { ok: false, message: 'Notifications permission was not granted.' }
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data
  const { error } = await supabase.from('user_push_tokens').upsert(
    {
      user_id: userId,
      email: email ? email.toLowerCase() : null,
      token,
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'unknown',
      device_name: Device.modelName ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  )

  if (error) return { ok: false, message: error.message }
  return { ok: true, message: 'Notifications are ready for seller events.' }
}
