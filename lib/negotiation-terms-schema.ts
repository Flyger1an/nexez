/** Shared agent-facing schema for buyer-requested negotiation terms. Unknown
 * fields remain allowed for seller review, but only these documented fields are
 * used by deterministic Smart Rules checks. */
export function negotiationTermsSchema() {
  return {
    type: 'object',
    description: 'Requested work and limits. Use the named fields when possible. Other terms remain available for seller review.',
    additionalProperties: true,
    properties: {
      scope: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' }, maxItems: 20 },
        ],
        description: 'Work the buyer wants included.',
      },
      deliverables: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' }, maxItems: 20 },
        ],
        description: 'Specific items the seller should deliver.',
      },
      revisionCount: {
        type: 'integer',
        minimum: 0,
        maximum: 1_000,
        description: 'Number of requested revision rounds.',
      },
      projectWeeks: {
        type: 'integer',
        minimum: 1,
        maximum: 1_000,
        description: 'Requested project length in weeks.',
      },
      constraints: {
        description: 'Other buyer requirements for seller review.',
      },
    },
  }
}
