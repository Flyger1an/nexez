import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SUPPLIED_WHITE_LOGO_SHA256 = 'ad386b3fdbfdfa0e0245503be0722ca39b2b258a6ff644ec5dc809e3b6159094'

describe('transactional email brand asset', () => {
  it('uses the exact final RGB Nexez AI logo supplied in the brand package', async () => {
    const logo = await readFile(path.join(process.cwd(), 'public', 'nexez-email-logo-white.png'))
    const digest = createHash('sha256').update(logo).digest('hex')

    expect(digest).toBe(SUPPLIED_WHITE_LOGO_SHA256)
  })
})
