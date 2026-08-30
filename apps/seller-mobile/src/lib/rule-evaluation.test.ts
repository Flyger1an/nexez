import { describe, expect, it } from 'vitest'
import { mobileRuleEvaluation } from './rule-evaluation'

describe('mobile rule evaluation', () => {
  it('renders stored platform checks and reasons without rule thresholds', () => {
    const result = mobileRuleEvaluation({
      rules_evaluation: {
        schemaVersion: 2,
        decision: 'flag',
        reasons: ['below_min_price', 'exceeds_revision_limit'],
        checks: [
          { key: 'price', status: 'fail', reason: 'outside_price_rules' },
          { key: 'revision_limit', status: 'fail', reason: 'exceeds_revision_limit' },
        ],
        minPrice: '$800',
      },
    })

    expect(result).toEqual({
      outcome: 'outside_rules',
      summary: 'This proposal is outside at least one saved rule.',
      checks: [
        { key: 'price', label: 'Price', status: 'fail', message: 'The offered price is outside the automatic pricing rules.' },
        { key: 'revision_limit', label: 'Revisions', status: 'fail', message: 'The requested revisions exceed the saved limit.' },
      ],
      reasons: ['Below min price', 'Exceeds revision limit'],
    })
    expect(JSON.stringify(result)).not.toContain('$800')
  })

  it('accepts the camel-case API envelope and drops unknown checks safely', () => {
    expect(mobileRuleEvaluation({
      ruleEvaluation: {
        decision: 'review',
        reasons: ['no_proposed_price'],
        checks: [
          { key: 'price', status: 'review', reason: 'price_not_provided' },
          { key: 'future_check', status: 'fail', reason: 'future_reason' },
        ],
      },
    })).toEqual({
      outcome: 'needs_review',
      summary: 'At least one proposal term needs review.',
      checks: [{ key: 'price', label: 'Price', status: 'review', message: 'No proposed price was provided.' }],
      reasons: ['No proposed price'],
    })
  })

  it.each([null, {}, { rules_evaluation: [] }, { rules_evaluation: { decision: 'unknown' } }])(
    'rejects malformed stored evaluations',
    (value) => expect(mobileRuleEvaluation(value)).toBeNull(),
  )
})
