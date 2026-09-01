import * as Sentry from '@sentry/react-native'
import type { ComponentType } from 'react'

import { config } from './config'

const observabilityEnabled = Boolean(config.sentryDsn)
let initialized = false

export function initObservability() {
  if (initialized) return
  initialized = true

  if (!observabilityEnabled) return

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.releaseStage,
    tracesSampleRate: __DEV__ ? 1 : 0.2,
  })
}

export function withObservability<P extends Record<string, unknown>>(
  Component: ComponentType<P>,
): ComponentType<P> {
  return observabilityEnabled ? Sentry.wrap(Component) : Component
}
