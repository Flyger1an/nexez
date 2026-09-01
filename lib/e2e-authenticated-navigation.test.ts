import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const helper = readFileSync('e2e/auth.ts', 'utf8')
const dashboard = readFileSync('e2e/dashboard-command-center-theme.spec.ts', 'utf8')
const editor = readFileSync('e2e/editor.spec.ts', 'utf8')
const settings = readFileSync('e2e/settings.spec.ts', 'utf8')
const goldenPath = readFileSync('e2e/settings-agent-lab-golden-path.spec.ts', 'utf8')

describe('E2E authenticated navigation contract', () => {
  it('waits for the one real application redirect instead of starting a competing navigation', () => {
    expect(helper).toContain('page.waitForURL(')
    expect(helper).toContain('destinationMatches(url, expected)')
    expect(helper).not.toContain('page.goto(destination')
    expect(helper).not.toContain("!url.pathname.startsWith('/login')")
  })

  it('uses the shared exact-destination helper on the core authenticated surfaces', () => {
    for (const source of [dashboard, editor, settings, goldenPath]) {
      expect(source).toContain("import { loginWithPassword } from './auth'")
      expect(source).toContain('await loginWithPassword(page, {')
    }
  })

  it('keeps standalone fixture cleanup from revoking every session for the seller', () => {
    expect(dashboard).toContain("auth.signOut({ scope: 'local' })")
    expect(editor).toContain("auth.signOut({ scope: 'local' })")
  })
})
