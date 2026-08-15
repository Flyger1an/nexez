// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import userEvent from '@testing-library/user-event'
import { CheckCircle2, Globe2 } from 'lucide-react'
import {
  SettingHint,
  SettingRow,
  SettingsNav,
  SettingsSection,
  SettingsSwitch,
  StatusPill,
  type SettingsNavItem,
} from './SettingsPrimitives'

const NAV_ITEMS: SettingsNavItem[] = [
  { id: 'general', label: 'General', icon: Globe2 },
  { id: 'integrations', label: 'Integrations' },
]

describe('SettingsSwitch', () => {
  it('exposes its binary state, accessible copy, and visible status', () => {
    render(
      <SettingsSwitch
        checked
        onCheckedChange={() => {}}
        label="Published visibility"
        description="Makes this listing available to agents."
        checkedLabel="Published"
        uncheckedLabel="Draft"
      />,
    )

    const control = screen.getByRole('switch', { name: 'Published visibility' })
    expect(control).toHaveAttribute('aria-checked', 'true')
    expect(control).toHaveAccessibleDescription('Makes this listing available to agents.')
    expect(screen.getByText('Published')).toBeVisible()

    const track = control.firstElementChild
    expect(track).toHaveClass('h-[27px]', 'w-[46px]', 'bg-[var(--control-on)]')
  })

  it('requests the next state when activated', () => {
    const onCheckedChange = vi.fn()
    render(<SettingsSwitch checked={false} onCheckedChange={onCheckedChange} label="MCP access" />)

    fireEvent.click(screen.getByRole('switch', { name: 'MCP access' }))

    expect(onCheckedChange).toHaveBeenCalledOnce()
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.getByText('Off')).toBeVisible()
  })

  it('supports native keyboard activation', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<SettingsSwitch checked={false} onCheckedChange={onCheckedChange} label="Public memory" />)

    await user.tab()
    expect(screen.getByRole('switch', { name: 'Public memory' })).toHaveFocus()
    await user.keyboard('[Space]')

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('prevents activation when explicitly disabled', async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(
      <SettingsSwitch
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
        label="White-label branding"
      />,
    )

    const control = screen.getByRole('switch', { name: 'White-label branding' })
    expect(control).toBeDisabled()
    await user.click(control)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('communicates pending state and prevents repeated activation', () => {
    const onCheckedChange = vi.fn()
    render(
      <SettingsSwitch
        checked
        pending
        onCheckedChange={onCheckedChange}
        label="Advanced AI Assist"
        pendingLabel="Updating…"
      />,
    )

    const control = screen.getByRole('switch', { name: 'Advanced AI Assist' })
    expect(control).toBeDisabled()
    expect(control).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText('Updating…')).toBeVisible()

    fireEvent.click(control)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  it('supports an external description relationship', () => {
    render(
      <>
        <p id="visibility-help">Changing visibility is saved with the section.</p>
        <SettingsSwitch
          checked={false}
          onCheckedChange={() => {}}
          label="Visibility"
          describedBy="visibility-help"
        />
      </>,
    )

    expect(screen.getByRole('switch', { name: 'Visibility' })).toHaveAccessibleDescription(
      'Changing visibility is saved with the section.',
    )
  })
})

describe('settings layout primitives', () => {
  it('renders a labelled section with status, action, content, and footer', () => {
    render(
      <SettingsSection
        id="domain-brand"
        title="Domain & brand"
        description="Control where the listing lives and how it looks."
        icon={Globe2}
        status={<StatusPill tone="ready" label="Verified" icon={CheckCircle2} />}
        action={<button type="button">Check status</button>}
        footer={<button type="button">Save domain</button>}
      >
        <p>Domain controls</p>
      </SettingsSection>,
    )

    const section = screen.getByRole('region', { name: 'Domain & brand' })
    expect(section).toHaveAttribute('id', 'domain-brand')
    expect(screen.getByText('Control where the listing lives and how it looks.')).toBeVisible()
    expect(screen.getByText('Verified')).toHaveClass('text-[var(--ready)]')
    expect(screen.getByRole('button', { name: 'Check status' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save domain' })).toBeVisible()
  })

  it('marks the active section in its accessible name and with a leading header marker', () => {
    render(
      <SettingsSection
        id="active-domain"
        title="Domain & brand"
        active
        activeLabel="Currently viewing"
      >
        <p>Domain controls</p>
      </SettingsSection>,
    )

    const section = screen.getByRole('region', { name: 'Domain & brand' })
    expect(section).toHaveAttribute('aria-current', 'location')
    expect(section).toHaveAccessibleDescription('Currently viewing')
    expect(section).not.toHaveClass('settings-priority-card')
    expect(section.querySelector('header > span[aria-hidden="true"]')).toHaveClass(
      'bg-[var(--settings-emphasis)]',
      'w-0.5',
    )
  })

  it('associates a row label with its field', () => {
    render(
      <SettingRow label="Listing name" description="Shown publicly." htmlFor="listing-name">
        <input id="listing-name" />
      </SettingRow>,
    )

    expect(screen.getByRole('textbox', { name: 'Listing name' })).toBeVisible()
    expect(screen.getByText('Shown publicly.')).toBeVisible()
  })

  it.each([
    ['ready', 'text-[var(--ready)]'],
    ['attention', 'text-[var(--amber)]'],
    ['danger', 'text-[var(--danger)]'],
    ['neutral', 'text-[var(--fg-muted)]'],
  ] as const)('renders the %s status tone semantically', (tone, expectedClass) => {
    render(<StatusPill label={`${tone} status`} tone={tone} />)
    expect(screen.getByText(`${tone} status`)).toHaveClass(expectedClass)
  })
})

describe('SettingsNav', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', window.location.pathname)
  })

  it('uses native hash links and updates the current location on selection', () => {
    const onNavigate = vi.fn()
    render(<SettingsNav items={NAV_ITEMS} onNavigate={onNavigate} />)

    const general = screen.getByRole('link', { name: 'General' })
    const integrations = screen.getByRole('link', { name: 'Integrations' })
    expect(general).toHaveAttribute('href', '#general')
    expect(general).toHaveAttribute('aria-current', 'location')
    expect(general).toHaveClass('settings-choice-active', 'focus-visible:ring-[var(--settings-focus)]')

    fireEvent.click(integrations)

    expect(onNavigate).toHaveBeenCalledWith('integrations')
    expect(integrations).toHaveAttribute('aria-current', 'location')
    expect(integrations).toHaveClass('settings-choice-active')
    expect(integrations.querySelector('span[aria-hidden="true"]')).toHaveClass(
      'bg-[var(--settings-emphasis)]',
      'w-0.5',
    )
    expect(general).not.toHaveAttribute('aria-current')
    expect(general).not.toHaveClass('settings-choice-active')
  })

  it('honors a valid hash when mounted uncontrolled', async () => {
    window.history.replaceState({}, '', '#integrations')
    render(<SettingsNav items={NAV_ITEMS} />)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute('aria-current', 'location')
    })
  })

  it('supports controlled active state', () => {
    render(<SettingsNav items={NAV_ITEMS} activeId="integrations" />)

    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute('aria-current', 'location')
    expect(screen.getByRole('link', { name: 'General' })).not.toHaveAttribute('aria-current')
  })
})

describe('SettingHint', () => {
  it('starts collapsed, with the panel hidden', () => {
    render(<SettingHint label="About Brand & domain">Connect a trusted hostname.</SettingHint>)
    const trigger = screen.getByRole('button', { name: 'About Brand & domain' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Connect a trusted hostname.')).not.toBeVisible()
  })

  it('opens on click and reports it', async () => {
    const user = userEvent.setup()
    render(<SettingHint label="About Brand & domain">Connect a trusted hostname.</SettingHint>)
    await user.click(screen.getByRole('button', { name: 'About Brand & domain' }))

    expect(screen.getByRole('button', { name: 'About Brand & domain' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Connect a trusted hostname.')).toBeVisible()
  })

  it('is operable from the keyboard, not just the mouse', async () => {
    const user = userEvent.setup()
    render(<SettingHint label="About Brand & domain">Connect a trusted hostname.</SettingHint>)
    await user.tab()
    expect(screen.getByRole('button', { name: 'About Brand & domain' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('Connect a trusted hostname.')).toBeVisible()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<SettingHint label="About Brand & domain">Connect a trusted hostname.</SettingHint>)
    await user.click(screen.getByRole('button', { name: 'About Brand & domain' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Connect a trusted hostname.')).not.toBeVisible())
  })

  it('closes on a click outside', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <SettingHint label="About Brand & domain">Connect a trusted hostname.</SettingHint>
        <button type="button">elsewhere</button>
      </div>,
    )
    await user.click(screen.getByRole('button', { name: 'About Brand & domain' }))
    await user.click(screen.getByRole('button', { name: 'elsewhere' }))
    await waitFor(() => expect(screen.queryByText('Connect a trusted hostname.')).not.toBeVisible())
  })

  it('stays open when the panel itself is clicked', async () => {
    const user = userEvent.setup()
    render(<SettingHint label="About Brand & domain">Connect a trusted hostname.</SettingHint>)
    await user.click(screen.getByRole('button', { name: 'About Brand & domain' }))
    await user.click(screen.getByText('Connect a trusted hostname.'))
    expect(screen.getByText('Connect a trusted hostname.')).toBeVisible()
  })

  it('keeps aria-controls pointing at a real element while collapsed', () => {
    // A dangling reference is worse than none: assistive tech following the
    // relationship finds nothing and reports the control as broken.
    render(<SettingHint label="About Brand & domain">Connect a trusted hostname.</SettingHint>)
    const id = screen.getByRole('button', { name: 'About Brand & domain' }).getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).not.toBeNull()
  })
})

describe('SettingsSection hint', () => {
  it('collapses the blurb behind a disclosure when hint is used', async () => {
    const user = userEvent.setup()
    render(
      <SettingsSection id="general" title="General" hint="Identity, contact path, and checkout defaults.">
        <p>body</p>
      </SettingsSection>,
    )
    expect(screen.queryByText('Identity, contact path, and checkout defaults.')).not.toBeVisible()
    await user.click(screen.getByRole('button', { name: 'About General' }))
    expect(screen.getByText('Identity, contact path, and checkout defaults.')).toBeVisible()
  })

  it('still prints description inline, for prose that must not be hidden', () => {
    render(
      <SettingsSection id="general" title="General" description="Currency saves immediately.">
        <p>body</p>
      </SettingsSection>,
    )
    expect(screen.getByText('Currency saves immediately.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'About General' })).toBeNull()
  })
})

