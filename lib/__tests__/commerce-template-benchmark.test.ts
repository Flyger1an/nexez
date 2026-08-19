import { describe, expect, it } from 'vitest'
import {
  COMMERCE_BENCHMARK_FORMAT_VERSION,
  commerceBenchmark,
  compileCommerceBenchmark,
  getCommerceBenchmarkCase,
  listCommerceBenchmarkCases,
} from '../commerce-templates/benchmark'
import { listCommerceTemplates } from '../commerce-templates/registry'
import type { CommerceTemplate } from '../commerce-templates/schema'
import { validateCommerceTemplate } from '../commerce-templates/validate'

describe('commerce template benchmark', () => {
  it('compiles every active pilot template into deterministic versioned cases', () => {
    const activeTemplates = listCommerceTemplates({ status: 'active' })

    expect(commerceBenchmark.formatVersion).toBe(COMMERCE_BENCHMARK_FORMAT_VERSION)
    expect(commerceBenchmark.templates).toEqual(
      [...activeTemplates]
        .sort((left, right) => left.id.localeCompare(right.id) || left.version - right.version)
        .map(({ id, version }) => ({ id, version })),
    )
    expect(new Set(commerceBenchmark.cases.map((benchmarkCase) => benchmarkCase.id)).size)
      .toBe(commerceBenchmark.cases.length)

    for (const template of activeTemplates) {
      const cases = listCommerceBenchmarkCases({ templateId: template.id })
      expect(cases.length).toBe(template.evals.length)
      expect(cases.every((benchmarkCase) => benchmarkCase.template.version === template.version)).toBe(true)
    }
  })

  it('preserves authored expectations without exposing mutable registry arrays', () => {
    const template = listCommerceTemplates({ status: 'active' })
      .find((candidate) => candidate.id === 'automotive.mobile-auto-detailing')
    expect(template).toBeDefined()

    const authored = template!.evals.find((evaluation) => evaluation.id.endsWith('.direct'))
    const compiled = getCommerceBenchmarkCase(authored!.id)

    expect(compiled).not.toBeNull()
    expect(compiled!.expected.templateId).toBe(template!.id)
    expect(compiled!.expected.requiredFactKeys).toEqual(authored!.expected.requiredFactKeys)
    expect(compiled!.expected.capabilityTags).toEqual(authored!.expected.capabilityTags)
    expect(compiled!.expected.mustNot).toEqual(authored!.expected.mustNot)
    expect(compiled!.expected.requiredFactKeys).not.toBe(authored!.expected.requiredFactKeys)
    expect(compiled!.expected.capabilityTags).not.toBe(authored!.expected.capabilityTags)
    expect(compiled!.expected.mustNot).not.toBe(authored!.expected.mustNot)
  })

  it('queries cases by template, difficulty, and exercised capability', () => {
    const configurableDetailing = listCommerceBenchmarkCases({
      templateId: 'automotive.mobile-auto-detailing',
      capabilityTag: 'CONFIGURABLE',
    })
    expect(configurableDetailing.length).toBeGreaterThan(0)
    expect(configurableDetailing.every((benchmarkCase) => benchmarkCase.template.id === 'automotive.mobile-auto-detailing')).toBe(true)
    expect(configurableDetailing.every((benchmarkCase) => benchmarkCase.expected.capabilityTags.includes('CONFIGURABLE'))).toBe(true)

    const complexCases = listCommerceBenchmarkCases({ difficulty: 'complex' })
    expect(complexCases.length).toBeGreaterThan(0)
    expect(complexCases.every((benchmarkCase) => benchmarkCase.difficulty === 'complex')).toBe(true)
  })

  it('rejects duplicate case ids when compiling arbitrary template sets', () => {
    const template = listCommerceTemplates({ status: 'active' })[0]!
    const duplicate: CommerceTemplate = {
      ...template,
      id: `${template.id}.duplicate`,
      evals: template.evals.map((evaluation) => ({
        ...evaluation,
        expected: { ...evaluation.expected, templateId: `${template.id}.duplicate` },
      })),
    }

    expect(() => compileCommerceBenchmark([template, duplicate])).toThrow(/Duplicate commerce benchmark case id/)
  })

  it('rejects malformed authored eval requests and duplicate expectations', () => {
    const template = listCommerceTemplates({ status: 'active' })[0]!
    const evaluation = template.evals[0]!
    const malformed: CommerceTemplate = {
      ...template,
      evals: [{
        ...evaluation,
        request: '   ',
        expected: {
          ...evaluation.expected,
          requiredFactKeys: [
            evaluation.expected.requiredFactKeys[0]!,
            evaluation.expected.requiredFactKeys[0]!,
          ],
          capabilityTags: [
            evaluation.expected.capabilityTags[0]!,
            evaluation.expected.capabilityTags[0]!,
          ],
          mustNot: ['do not invent facts', 'do not invent facts'],
        },
      }],
    }

    const paths = validateCommerceTemplate(malformed).map((issue) => issue.path)
    expect(paths).toContain('evals[0].request')
    expect(paths).toContain('evals[0].expected.requiredFactKeys')
    expect(paths).toContain('evals[0].expected.capabilityTags')
    expect(paths).toContain('evals[0].expected.mustNot')
  })
})
