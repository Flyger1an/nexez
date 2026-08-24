import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const NEXEZ_PLATFORM_ICON_SHA256 = 'eef47e83a627e47cd3ef14a2d73fd4ccd88ee0265bd4fc8b5bd7674667f08282'

describe('transactional email brand asset', () => {
  it('uses the email-safe raster of the exact Nexez platform favicon', async () => {
    const icon = await readFile(path.join(process.cwd(), 'public', 'nexez-email-icon.png'))
    const digest = createHash('sha256').update(icon).digest('hex')

    expect(digest).toBe(NEXEZ_PLATFORM_ICON_SHA256)
  })
})
