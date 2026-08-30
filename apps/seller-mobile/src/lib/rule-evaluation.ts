export type MobileRuleCheck = {
  key: string
  label: string
  status: 'pass' | 'review' | 'fail'
  message: string
}

export type MobileRuleEvaluation = {
  outcome: 'meets_rules' | 'needs_review' | 'outside_rules'
  summary: string
  checks: MobileRuleCheck[]
  reasons: string[]
}

const CHECK_COPY: Record<string, { label: string; messages: Record<string, string> }> = {
  price: {
    label: 'Price',
    messages: {
      price_not_provided: 'No proposed price was provided.',
      price_rule_misconfigured: 'The saved pricing rule needs manual review.',
      outside_price_rules: 'The offered price is outside the automatic pricing rules.',
      price_within_rules: 'The offered price is within the saved rules.',
      price_requires_review: 'The offered price needs manual review.',
    },
  },
  included_scope: {
    label: 'Requested work',
    messages: {
      scope_not_provided: 'The buyer did not describe the requested work.',
      included_scope_match: 'The requested work matches the included scope.',
      scope_needs_review: 'The requested work needs manual review.',
    },
  },
  excluded_scope: {
    label: 'Excluded work',
    messages: {
      scope_not_provided: 'The buyer did not describe the requested work.',
      excluded_scope_requested: 'The buyer requested work that this offer excludes.',
      excluded_scope_clear: 'No explicitly excluded work was requested.',
    },
  },
  revision_limit: {
    label: 'Revisions',
    messages: {
      revision_count_not_provided: 'The buyer did not provide a revision count.',
      invalid_revision_count: 'The requested revision count is invalid.',
      within_revision_limit: 'The requested revisions are within the saved limit.',
      exceeds_revision_limit: 'The requested revisions exceed the saved limit.',
      seller_term_rule_misconfigured: 'The saved revision limit needs manual review.',
    },
  },
  project_length: {
    label: 'Project length',
    messages: {
      project_length_not_provided: 'The buyer did not provide a project length.',
      invalid_project_length: 'The requested project length is invalid.',
      within_project_length: 'The requested project length is within the saved limit.',
      exceeds_project_length: 'The requested project length exceeds the saved limit.',
      seller_term_rule_misconfigured: 'The saved project-length limit needs manual review.',
    },
  },
}

function reasonLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase())
}

/** Parse the stored platform evaluation without exposing rule thresholds. */
export function mobileRuleEvaluation(metadata: unknown): MobileRuleEvaluation | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const record = metadata as Record<string, unknown>
  const value = record.rules_evaluation ?? record.ruleEvaluation
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value as Record<string, unknown>
  const decision = String(source.decision ?? '')
  if (!['auto_accept', 'review', 'flag'].includes(decision)) return null

  const checks = Array.isArray(source.checks)
    ? source.checks.flatMap((candidate): MobileRuleCheck[] => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
      const check = candidate as Record<string, unknown>
      const key = String(check.key ?? '')
      const status = String(check.status ?? '')
      const reason = String(check.reason ?? '')
      const copy = CHECK_COPY[key]
      if (!copy || !['pass', 'review', 'fail'].includes(status)) return []
      return [{
        key,
        label: copy.label,
        status: status as MobileRuleCheck['status'],
        message: copy.messages[reason] ?? `${copy.label} needs manual review.`,
      }]
    })
    : []
  const reasons = Array.isArray(source.reasons)
    ? [...new Set(source.reasons.filter((reason): reason is string => typeof reason === 'string' && reason.trim().length > 0).map(reasonLabel))]
    : []
  const outcome = decision === 'auto_accept'
    ? 'meets_rules'
    : decision === 'flag'
      ? 'outside_rules'
      : 'needs_review'

  return {
    outcome,
    summary: outcome === 'meets_rules'
      ? 'This proposal meets the automatic rules.'
      : outcome === 'outside_rules'
        ? 'This proposal is outside at least one saved rule.'
        : 'At least one proposal term needs review.',
    checks,
    reasons,
  }
}
