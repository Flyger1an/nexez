// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { BrandingPanel, type BrandingValues } from './BrandingPanel'

const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn()

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
  }),
}))

const EMPTY: BrandingValues = { brandName: '', accentColor: '', logoUrl: '', hideNexezBadge: false }

function setup(values: Partial<BrandingValues> = {}, websiteUrl = 'https://example.com') {
  const onChange = vi.fn()
  const onMessage = vi.fn()
  render(
    <BrandingPanel
      pageId="page-1"
      plan="pro"
      websiteUrl={websiteUrl}
      values={{ ...EMPTY, ...values }}
      onChange={onChange}
      onMessage={onMessage}
    />,
  )
  return { onChange, onMessage }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('BrandingPanel', () => {
  it('renders the branding fields', () => {
    setup()
    expect(screen.getByPlaceholderText('Apex Plumbing Co.')).toBeTruthy()
    expect(screen.getByPlaceholderText('#7C3AED')).toBeTruthy()
    expect(screen.getByPlaceholderText('https://apexplumbing.com/logo.svg')).toBeTruthy()
  })

  it('reports edits upward as a patch rather than owning the value', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByPlaceholderText('Apex Plumbing Co.'), { target: { value: 'Apex' } })
    expect(onChange).toHaveBeenCalledWith({ brandName: 'Apex' })
  })

  it('clears the logo and says the change is only staged', () => {
    const { onChange, onMessage } = setup({ logoUrl: 'https://cdn.example.com/logo.png' })
    fireEvent.click(screen.getByText('Remove logo'))
    expect(onChange).toHaveBeenCalledWith({ logoUrl: '' })
    expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/Save Settings/i))
  })

  it('shows a logo preview only once a logo exists', () => {
    setup()
    expect(screen.queryByAltText('logo preview')).toBeNull()
    setup({ logoUrl: 'https://cdn.example.com/logo.png' })
    expect(screen.getByAltText('logo preview')).toBeTruthy()
  })

  it('disables one-click detection when there is no website to read', () => {
    setup({}, '')
    const button = screen.getByText(/One-click/) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('promotes a detected logo to the parent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, suggestedPage: { logo_url: 'https://example.com/l.svg' } })),
      ),
    )
    const { onChange } = setup()
    fireEvent.click(screen.getByText(/One-click/))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ logoUrl: 'https://example.com/l.svg' }))
  })

  it('says so plainly when detection finds nothing, instead of failing silently', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, suggestedPage: {} }))))
    const { onChange, onMessage } = setup()
    fireEvent.click(screen.getByText(/One-click/))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/No logo found/i)))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('surfaces a detection failure rather than leaving the button spinning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'boom' }))))
    const { onMessage } = setup()
    fireEvent.click(screen.getByText(/One-click/))
    await waitFor(() => expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/boom/)))
    // uploadingLogo must be released, or the control stays dead for the session.
    await waitFor(() => expect((screen.getByText(/One-click/) as HTMLButtonElement).disabled).toBe(false))
  })

  it('gates the plan-limited features behind an upgrade badge on Free', () => {
    render(
      <BrandingPanel
        pageId="page-1"
        plan="free"
        websiteUrl="https://example.com"
        values={EMPTY}
        onChange={vi.fn()}
        onMessage={vi.fn()}
      />,
    )
    expect(screen.getAllByText(/Pro|Upgrade|Launch/i).length).toBeGreaterThan(0)
  })
})
