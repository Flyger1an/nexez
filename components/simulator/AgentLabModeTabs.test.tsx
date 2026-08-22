// @vitest-environment jsdom

import { fireEvent, render, screen } from '../../test/dom'
import { describe, expect, it, vi } from 'vitest'
import { AgentLabModeTabs } from './AgentLabModeTabs'

describe('AgentLabModeTabs', () => {
  it('uses a roving tab stop and supports arrow, Home, and End navigation', () => {
    const change = vi.fn()
    render(<AgentLabModeTabs mode="test" isLoggedIn={false} onChange={change} />)

    const testTab = screen.getByRole('tab', { name: 'Test a listing' })
    const urlTab = screen.getByRole('tab', { name: 'Any URL' })
    const compareTab = screen.getByRole('tab', { name: /Compare a competitor/ })
    expect(testTab).toHaveAttribute('tabindex', '0')
    expect(urlTab).toHaveAttribute('tabindex', '-1')

    testTab.focus()
    fireEvent.keyDown(testTab, { key: 'ArrowRight' })
    expect(change).toHaveBeenLastCalledWith('url')
    expect(urlTab).toHaveFocus()

    fireEvent.keyDown(urlTab, { key: 'End' })
    expect(change).toHaveBeenLastCalledWith('compare')
    expect(compareTab).toHaveFocus()

    fireEvent.keyDown(compareTab, { key: 'Home' })
    expect(change).toHaveBeenLastCalledWith('test')
    expect(testTab).toHaveFocus()
  })

  it('marks competitor comparison as sign-in gated without disabling discovery', () => {
    const change = vi.fn()
    render(<AgentLabModeTabs mode="url" isLoggedIn={false} onChange={change} />)

    fireEvent.click(screen.getByRole('tab', { name: /Compare a competitor.*sign in/ }))
    expect(change).toHaveBeenCalledWith('compare')
  })
})
