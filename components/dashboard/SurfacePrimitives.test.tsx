// @vitest-environment jsdom

import { Settings } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '../../test/dom'
import { SurfaceHeader, surfaceActionClass } from './SurfacePrimitives'

describe('SurfacePrimitives', () => {
  it('uses a page icon instead of the retired gradient dash', () => {
    const { container } = render(
      <SurfaceHeader eyebrow="Platform settings" icon={Settings} title="Settings" />,
    )

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(container.querySelector('.surface-eyebrow')).toHaveTextContent('Platform settings')
    expect(container.querySelector('.surface-eyebrow')).not.toHaveClass('bg-[var(--prism)]')
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('exports the flat persimmon-outline action contract', () => {
    expect(surfaceActionClass).toContain('settings-emphasis-action')
    expect(surfaceActionClass).toContain('bg-transparent')
  })
})
