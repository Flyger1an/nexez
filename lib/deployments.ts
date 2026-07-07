// D-tier - per-page "deployments" built on the existing `versions` snapshots
// (newest-first). Pure helpers so the timeline + rollback UI and tests share
// one source of truth. No new storage: a deployment IS a version snapshot.
import { FaqItem, OfferItem } from './agent-page'

export type PageVersion = {
  timestamp: string
  name: string
  description?: string | null
  services: OfferItem[] | null
  products: OfferItem[] | null
  faqs: FaqItem[] | null
  industry?: string | null
  prefer_original_site?: boolean
}

export type DeploymentSummary = {
  index: number
  timestamp: string
  name: string
  offerCount: number
  faqCount: number
  preferOriginal: boolean
  isCurrent: boolean // index 0 = most recent save = current live content
}

export function countVersionOffers(v: Pick<PageVersion, 'services' | 'products'>): number {
  return (v.services?.length || 0) + (v.products?.length || 0)
}

export function summarizeDeployments(
  versions: PageVersion[] | null | undefined,
): DeploymentSummary[] {
  if (!versions || !versions.length) return []
  return versions.map((v, index) => ({
    index,
    timestamp: v.timestamp,
    name: v.name,
    offerCount: countVersionOffers(v),
    faqCount: v.faqs?.length || 0,
    preferOriginal: !!v.prefer_original_site,
    isCurrent: index === 0,
  }))
}

/** Human-readable diff of a deployment vs the previous (older) one. */
export function describeDeploymentChange(
  current: PageVersion,
  previous?: PageVersion | null,
): string {
  if (!previous) return 'Initial saved deployment'

  const parts: string[] = []
  const dOffers = countVersionOffers(current) - countVersionOffers(previous)
  if (dOffers !== 0) {
    parts.push(`${dOffers > 0 ? '+' : ''}${dOffers} offer${Math.abs(dOffers) === 1 ? '' : 's'}`)
  }
  const dFaqs = (current.faqs?.length || 0) - (previous.faqs?.length || 0)
  if (dFaqs !== 0) {
    parts.push(`${dFaqs > 0 ? '+' : ''}${dFaqs} FAQ${Math.abs(dFaqs) === 1 ? '' : 's'}`)
  }
  if (current.name !== previous.name) parts.push('name changed')
  if (!!current.prefer_original_site !== !!previous.prefer_original_site) {
    parts.push(`prefer-original ${current.prefer_original_site ? 'on' : 'off'}`)
  }
  if ((current.description || '') !== (previous.description || '')) parts.push('description edited')

  return parts.length ? parts.join(', ') : 'No structural change'
}

/** Convenience: the change label for the deployment at `index` vs the next-older one. */
export function deploymentChangeAt(versions: PageVersion[], index: number): string {
  return describeDeploymentChange(versions[index], versions[index + 1])
}
