import type { Metadata } from 'next'
import { AdminShell } from '../../components/admin/AdminShell'
import { requirePlatformAdmin } from '../../lib/server/admin-access'

export const metadata: Metadata = {
  title: 'Admin Control',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin('/admin')
  return <AdminShell email={user.email ?? 'Platform admin'}>{children}</AdminShell>
}
