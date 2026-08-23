import type { ReactNode } from 'react'
import { ViewerPlanProvider } from '../../components/billing/ViewerPlanProvider'

export default function CreateLayout({ children }: { children: ReactNode }) {
  return <ViewerPlanProvider>{children}</ViewerPlanProvider>
}
