import { describe, expect, it } from 'vitest'
import Image, { alt, contentType, size } from './opengraph-image'
import Hub from '../opengraph-image'
import { learnArticles } from '../../../lib/learn-content'

// One end-to-end render per card shape. The unit tests in lib/learn-og.test.ts
// cover the title split; this covers the part that can only fail at runtime,
// namely satori refusing a layout or the unknown-slug path throwing instead of
// falling back (an image route that throws costs the page its share card).

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]

async function bytes(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer())
}

describe('/learn/[slug] opengraph-image', () => {
  it('declares the file-convention exports Next reads', () => {
    expect(size).toEqual({ width: 1200, height: 630 })
    expect(contentType).toBe('image/png')
    expect(alt.length).toBeGreaterThan(0)
  })

  it('renders a real png for a published article', async () => {
    const res = await Image({ params: Promise.resolve({ slug: learnArticles[0]!.slug }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const buf = await bytes(res)
    expect([...buf.slice(0, 4)]).toEqual(PNG_MAGIC)
    expect(buf.length).toBeGreaterThan(5_000)
  })

  it('falls back to the generic card for an unknown slug rather than throwing', async () => {
    const res = await Image({ params: Promise.resolve({ slug: 'no-such-article' }) })
    expect(res.status).toBe(200)
    expect([...(await bytes(res)).slice(0, 4)]).toEqual(PNG_MAGIC)
  })

  it('renders the hub card', async () => {
    const res = await Hub()
    expect(res.status).toBe(200)
    expect([...(await bytes(res)).slice(0, 4)]).toEqual(PNG_MAGIC)
  })
})
