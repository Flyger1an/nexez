import type { CommerceTemplate } from '../../schema'
export { recurringHomeCleaning } from './recurring-home-cleaning'
export { mobileAutoDetailing } from './mobile-auto-detailing'
export { privateChef } from './private-chef'
export { eventPhotography } from './event-photography'
export { businessStrategySession } from './business-strategy-session'
export { privateTutoring } from './private-tutoring'
export { webDesignProject } from './web-design-project'

import { recurringHomeCleaning } from './recurring-home-cleaning'
import { mobileAutoDetailing } from './mobile-auto-detailing'
import { privateChef } from './private-chef'
import { eventPhotography } from './event-photography'
import { businessStrategySession } from './business-strategy-session'
import { privateTutoring } from './private-tutoring'
import { webDesignProject } from './web-design-project'

export const pilotCommerceTemplates: CommerceTemplate[] = [
  recurringHomeCleaning, mobileAutoDetailing, privateChef, eventPhotography,
  businessStrategySession, privateTutoring, webDesignProject,
]
