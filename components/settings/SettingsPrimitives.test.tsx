// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import userEvent from '@testing-library/user-event'
import { CheckCircle2, Globe2 } from 'lucide-react'
import {
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

    fireEvent.click(integrations)

    expect(onNavigate).toHaveBeenCalledWith('integrations')
    expect(integrations).toHaveAttribute('aria-current', 'location')
    expect(general).not.toHaveAttribute('aria-current')
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
