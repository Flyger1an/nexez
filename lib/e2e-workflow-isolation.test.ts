import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/e2e.yml', 'utf8')

describe('E2E shared seller isolation', () => {
  it('serializes every E2E workflow run through one repository-wide group', () => {
    const concurrencyStart = workflow.indexOf('\nconcurrency:\n')
    const jobsStart = workflow.indexOf('\njobs:\n')

    expect(concurrencyStart).toBeGreaterThan(0)
    expect(jobsStart).toBeGreaterThan(concurrencyStart)

    const block = workflow.slice(concurrencyStart, jobsStart)
    expect(block).toContain('group: nexez-e2e-shared-seller')
    expect(block).toContain('cancel-in-progress: false')
    expect(block).not.toMatch(/github\.(?:ref|head_ref)/)
  })

  it('keeps application auth changes and failure evidence inside the E2E gate', () => {
    expect(workflow).toContain("- 'utils/**'")
    expect(workflow).toContain('name: Upload Playwright failure evidence')
    expect(workflow).toContain('if: failure()')
    expect(workflow).toContain('uses: actions/upload-artifact@v4')
    expect(workflow).toContain('test-results')
    expect(workflow).toContain('playwright-report')
    expect(workflow).toContain('retention-days: 7')
  })
})
