export type PublicSimulatorMode =
  | 'marketplace'
  | 'partial_match'
  | 'simulation'
  | 'coverage_gap'

export type PublicSimulatorDecisionStatus =
  | 'understood'
  | 'live'
  | 'related'
  | 'checked'
  | 'reference'
  | 'protected'
  | 'verify'
  | 'actionable'

export type PublicSimulatorDecisionStep = {
  key: 'intent' | 'supply' | 'commerce' | 'action'
  status: PublicSimulatorDecisionStatus
  label: string
  detail: string
}

type DecisionPathInput =
  | {
      mode: 'marketplace'
      intentLabel: string
      merchantName: string
      offerName: string | null
      checkoutUrl: string | null
    }
  | {
      mode: 'partial_match'
      intentLabel: string
      merchantName: string
      offerName: string | null
    }
  | {
      mode: 'simulation'
      intentLabel: string
      referenceTitle: string
    }
  | {
      mode: 'coverage_gap'
      intentLabel: string
      requestLabel: string
    }

/**
 * Builds the buyer-safe explanation of how Nexez reached a simulator outcome.
 * Every path is explicit about what was observed, what remains unverified, and
 * whether a real merchant action is available. No score or internal taxonomy
 * leaks into this contract.
 */
export function buildPublicSimulatorDecisionPath(
  input: DecisionPathInput,
): PublicSimulatorDecisionStep[] {
  const understood: PublicSimulatorDecisionStep = {
    key: 'intent',
    status: 'understood',
    label: input.intentLabel,
    detail: input.mode === 'coverage_gap'
      ? input.requestLabel
      : 'Buyer request classified without changing its service category.',
  }

  if (input.mode === 'marketplace') {
    const hasCheckout = Boolean(input.checkoutUrl)
    return [
      understood,
      {
        key: 'supply',
        status: 'live',
        label: 'Live marketplace match',
        detail: input.merchantName,
      },
      {
        key: 'commerce',
        status: 'checked',
        label: 'Published commerce checked',
        detail: input.offerName ?? 'No exact structured offer is published yet.',
      },
      {
        key: 'action',
        status: hasCheckout ? 'actionable' : 'verify',
        label: hasCheckout ? 'Merchant action path available' : 'Merchant validation required',
        detail: hasCheckout
          ? 'Continue only through the merchant’s published checkout path.'
          : 'Confirm the requested details before presenting price, availability, or booking.',
      },
    ]
  }

  if (input.mode === 'partial_match') {
    return [
      understood,
      {
        key: 'supply',
        status: 'related',
        label: 'Related marketplace supply',
        detail: input.merchantName,
      },
      {
        key: 'commerce',
        status: 'checked',
        label: 'Requirement coverage compared',
        detail: input.offerName
          ? `“${input.offerName}” does not establish the complete request.`
          : 'No published offer establishes the complete request.',
      },
      {
        key: 'action',
        status: 'verify',
        label: 'Merchant confirmation required',
        detail: 'Verify the unsupported requirements before presenting a fit or action path.',
      },
    ]
  }

  if (input.mode === 'simulation') {
    return [
      understood,
      {
        key: 'supply',
        status: 'checked',
        label: 'Live marketplace checked',
        detail: 'No matching published provider is available yet.',
      },
      {
        key: 'commerce',
        status: 'reference',
        label: 'Commerce behavior understood',
        detail: `${input.referenceTitle} is the closest non-purchasable reference.`,
      },
      {
        key: 'action',
        status: 'protected',
        label: 'Real merchant required',
        detail: 'No price, availability, inventory, or booking was invented.',
      },
    ]
  }

  return [
    understood,
    {
      key: 'supply',
      status: 'checked',
      label: 'Live marketplace searched',
      detail: 'No matching published provider is available yet.',
    },
    {
      key: 'commerce',
      status: 'checked',
      label: 'Commerce Library searched',
      detail: 'No trustworthy reference scenario covers this request yet.',
    },
    {
      key: 'action',
      status: 'protected',
      label: 'Buyer intent preserved',
      detail: 'Nexez did not redirect the request to an unrelated service.',
    },
  ]
}
