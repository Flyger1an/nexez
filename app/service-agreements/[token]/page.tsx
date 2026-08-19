import type { Metadata } from 'next'
import { AgreementPortal } from './AgreementPortal'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Your recurring service',
  robots: { index: false, follow: false },
}

type PageProps = { params: Promise<{ token: string }> }

export default async function ServiceAgreementPage({ params }: PageProps) {
  const { token } = await params
  return <AgreementPortal token={token} />
}
