import 'react-native-url-polyfill/auto'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useRouter } from 'expo-router'
import type { Href } from 'expo-router'
import { useSession } from '@/src/hooks/useSession'
import { sellerNotificationDestination } from '@/src/lib/notification-routing'

type NotificationSubscription = { remove: () => void }

/** Routes cold-start and foreground notification taps after auth is ready. */
export function NotificationObserver() {
  const router = useRouter()
  const { loading, session } = useSession()

  useEffect(() => {
    if (Platform.OS === 'web' || loading || !session) return

    let active = true
    let subscription: NotificationSubscription | null = null
    const handled = new Set<string>()

    void import('expo-notifications').then(async (Notifications) => {
      if (!active) return

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      })

      const redirect = (response: Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>) => {
        if (!active || !response) return false
        const identifier = response.notification.request.identifier
        if (handled.has(identifier)) return false
        handled.add(identifier)
        router.push(sellerNotificationDestination(response.notification.request.content.data) as Href)
        return true
      }

      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        if (redirect(response)) void Notifications.clearLastNotificationResponseAsync()
      })

      const initial = await Notifications.getLastNotificationResponseAsync()
      if (redirect(initial)) await Notifications.clearLastNotificationResponseAsync()
    }).catch(() => {
      // Notification routing is best-effort and must never prevent the seller app from opening.
    })

    return () => {
      active = false
      subscription?.remove()
    }
  }, [loading, router, session])

  return null
}
