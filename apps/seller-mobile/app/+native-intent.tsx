import 'react-native-url-polyfill/auto'
import { normalizeSellerDeepLink } from '@/src/lib/notification-routing'

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return normalizeSellerDeepLink(path) ?? '/overview'
  } catch {
    return '/overview'
  }
}
