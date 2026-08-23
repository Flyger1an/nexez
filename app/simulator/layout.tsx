import type { ReactNode } from 'react'
import { ViewerPlanProvider } from '../../components/billing/ViewerPlanProvider'

export default function SimulatorLayout({ children }: { children: ReactNode }) {
  return <ViewerPlanProvider>{children}</ViewerPlanProvider>
}
