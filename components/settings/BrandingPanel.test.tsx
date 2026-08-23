// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../test/dom'
import { BrandingPanel, type BrandingValues } from './BrandingPanel'
import type { PlanId } from '../../lib/billing'

const uploadMock = vi.fn()
const getPublicUrlMock = vi.fn()

vi.mock('../../utils/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    storage: { from: () => ({ upload: uploadMock, getPublicUrl: getPublicUrlMock }) },
  }),
}))

const EMPTY: BrandingValues = { brandName: '', accentColor: '', logoUrl: '', hideNexezBadge: false }

function setup(values: Partial<BrandingValues> = {}, websiteUrl = 'https://example.com', plan: PlanId = 'pro') {
  const onChange = vi.fn()
  const onMessage = vi.fn()
  const rendered = render(
    <BrandingPanel
      pageId="page-1"
      plan={plan}
      websiteUrl={websiteUrl}
      values={{ ...EMPTY, ...values }}
      onChange={onChange}
      onMessage={onMessage}
    />,
  )
  return { onChange, onMessage, ...rendered }
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

  it('fails closed for new branding, uploads, detection, and badge removal below Launch', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { onChange, container } = setup({}, 'https://example.com', 'free')

    expect(screen.getByPlaceholderText('Apex Plumbing Co.')).toHaveAttribute('readonly')
    expect(screen.getByPlaceholderText('#7C3AED')).toHaveAttribute('readonly')
    expect(screen.getByPlaceholderText('https://apexplumbing.com/logo.svg')).toHaveAttribute('readonly')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeDisabled()
    expect(screen.getByRole('button', { name: /One-click/ })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Nexez attribution' })).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('Apex Plumbing Co.'), { target: { value: 'Blocked' } })
    fireEvent.change(fileInput, {
      target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: /One-click/ }))
    expect(onChange).not.toHaveBeenCalled()
    expect(uploadMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('link', { name: /Launch/ }).length).toBeGreaterThan(0)
  })

  it('labels retained branding paused and keeps explicit cleanup available after downgrade', () => {
    const { onChange, onMessage } = setup({
      brandName: 'Apex',
      accentColor: '#7C3AED',
      logoUrl: 'https://cdn.example.com/logo.png',
      hideNexezBadge: true,
    }, 'https://example.com', 'free')

    expect(screen.getByText(/configured but paused/i)).toBeInTheDocument()
    expect(screen.getByText(/Configured · paused; turn off to clear/i)).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Nexez attribution' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Reset premium branding' }))
    expect(onChange).toHaveBeenCalledWith({
      brandName: '',
      accentColor: '',
      logoUrl: '',
      hideNexezBadge: false,
    })
    expect(onMessage).toHaveBeenCalledWith(expect.stringMatching(/Save Settings/i))
  })

  it('allows a downgraded owner to clear retained badge removal directly', () => {
    const { onChange } = setup({ hideNexezBadge: true }, 'https://example.com', 'free')

    fireEvent.click(screen.getByRole('switch', { name: 'Nexez attribution' }))
    expect(onChange).toHaveBeenCalledWith({ hideNexezBadge: false })
  })

  it('unlocks premium branding at the matrix-derived Launch tier', () => {
    const { onChange } = setup({}, 'https://example.com', 'launch')

    const brandName = screen.getByPlaceholderText('Apex Plumbing Co.')
    expect(brandName).not.toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: /One-click/ })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Nexez attribution' })).toBeEnabled()
    fireEvent.change(brandName, { target: { value: 'Launch Brand' } })
    expect(onChange).toHaveBeenCalledWith({ brandName: 'Launch Brand' })
  })

  it('allows an entitled owner to upload a new logo', async () => {
    uploadMock.mockResolvedValue({ error: null })
    getPublicUrlMock.mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/new-logo.png' } })
    const { onChange, container } = setup({}, 'https://example.com', 'launch')
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(fileInput, {
      target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ logoUrl: 'https://cdn.example.com/new-logo.png' }))
    expect(uploadMock).toHaveBeenCalledTimes(1)
  })
})
