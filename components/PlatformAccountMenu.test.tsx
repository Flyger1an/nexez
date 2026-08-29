// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '../test/dom'
import { PlatformAccountMenu } from './PlatformAccountMenu'

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.className = 'dark'
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

describe('PlatformAccountMenu', () => {
  it('collects signed-in account utilities without hiding the agent-layer status', async () => {
    render(
      <PlatformAccountMenu
        authState="signed-in"
        viewer={{ displayName: 'Nexez Studio', email: 'owner@nexez.ai' }}
        pinned
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open account menu' }), {
      button: 0,
      ctrlKey: false,
    })

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('owner@nexez.ai')).toBeVisible()
    expect(within(menu).getByRole('menuitem', { name: 'Home Page' })).toHaveAttribute('href', '/')
    expect(within(menu).getByRole('menuitem', { name: 'Billing & plan' })).toHaveAttribute('href', '/dashboard/billing')
    expect(within(menu).getByRole('menuitem', { name: 'Open platform settings' })).toHaveAttribute('href', '/dashboard/settings#workspace')
    expect(within(menu).getByRole('menuitem', { name: 'Send feedback' })).toHaveAttribute(
      'href',
      '/support?category=general&subject=Product%20feedback',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Agent layer active' })).toHaveAttribute(
      'href',
      '/dashboard/settings#agent-surfaces',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toHaveAttribute('type', 'submit')
  })

  it('uses the primary storefront logo before the account initial and falls back safely', () => {
    const { container } = render(
      <PlatformAccountMenu
        authState="signed-in"
        viewer={{
          displayName: 'Axle',
          email: 'owner@nexez.ai',
          logoUrl: 'https://cdn.example.com/axle-logo.png',
        }}
        pinned
      />,
    )

    const logo = container.querySelector('img')
    expect(logo).toHaveAttribute('src', 'https://cdn.example.com/axle-logo.png')
    expect(screen.queryByText('A')).not.toBeInTheDocument()

    fireEvent.error(logo!)
    expect(screen.getByText('A')).toBeVisible()
  })

  it('changes theme without dismissing the utility menu', async () => {
    render(
      <PlatformAccountMenu
        authState="signed-in"
        viewer={{ displayName: 'Nexez Studio', email: 'owner@nexez.ai' }}
        pinned={false}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open account menu' }), {
      button: 0,
      ctrlKey: false,
    })
    const lightTheme = await screen.findByRole('menuitemradio', { name: 'Light theme' })
    fireEvent.click(lightTheme)

    expect(window.localStorage.getItem('nexez-theme')).toBe('light')
    expect(document.documentElement).toHaveClass('light')
    expect(screen.getByRole('menu')).toBeVisible()
  })

  it('keeps public resources available while hiding signed-in account actions', async () => {
    render(<PlatformAccountMenu authState="signed-out" viewer={null} pinned />)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open account menu' }), {
      button: 0,
      ctrlKey: false,
    })

    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Home Page' })).toBeVisible()
    expect(within(menu).queryByRole('menuitem', { name: 'Billing & plan' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Open platform settings' })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(within(menu).getByRole('menuitem', { name: 'Agent layer active' })).toHaveAttribute('href', '/docs')
  })

  it('opens from the keyboard and returns focus to the trigger on Escape', async () => {
    render(
      <PlatformAccountMenu
        authState="signed-in"
        viewer={{ displayName: 'Nexez Studio', email: 'owner@nexez.ai' }}
        pinned
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Open account menu' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    const menu = await screen.findByRole('menu')

    fireEvent.keyDown(menu, { key: 'Escape' })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
