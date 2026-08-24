import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const NEXEZ_PLATFORM_LOCKUP_SHA256 = '30b02bc5850b664f9aa652cc7862663d8e1d0abb44b077b00291465f67e0a3d3'

describe('transactional email brand asset', () => {
  it('uses the email-safe raster of the exact Nexez platform lockup', async () => {
    const logo = await readFile(path.join(process.cwd(), 'public', 'nexez-email-logo-white.png'))
    const digest = createHash('sha256').update(logo).digest('hex')

    expect(digest).toBe(NEXEZ_PLATFORM_LOCKUP_SHA256)
  })
})
