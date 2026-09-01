import { expect, type Page } from '@playwright/test'

const AUTH_COOKIE_NAME = /^(?:sb-.*-auth-token|nexez-admin-auth-token)(?:\.\d+)?$/
const PASSWORD_GRANT_PATH = '/auth/v1/token'

type LoginWithPasswordOptions = {
  email: string
  password: string
  destination?: string
}

function protectedDestination(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    throw new Error(`E2E login destination must be a same-origin path: ${value}`)
  }
  return value
}

function isPasswordGrantResponse(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.pathname.endsWith(PASSWORD_GRANT_PATH)
      && parsed.searchParams.get('grant_type') === 'password'
  } catch {
    return false
  }
}

async function authCookieNames(page: Page): Promise<string[]> {
  return (await page.context().cookies())
    .filter((cookie) => AUTH_COOKIE_NAME.test(cookie.name) && cookie.value.length > 0)
    .map((cookie) => cookie.name)
    .sort()
}

/**
 * Uses the real password form, then waits for the Supabase cookie write before
 * making a protected request. Waiting only for "not /login" is racy because the
 * client redirect can begin before the next server request has observed the
 * newly persisted session.
 */
export async function loginWithPassword(
  page: Page,
  options: LoginWithPasswordOptions,
): Promise<void> {
  const destination = protectedDestination(options.destination ?? '/dashboard')
  const expected = new URL(destination, 'http://e2e.local')

  await page.goto(`/login?next=${encodeURIComponent(destination)}`, {
    waitUntil: 'domcontentloaded',
  })

  const passwordGrant = page.waitForResponse(
    (response) => isPasswordGrantResponse(response.url()),
    { timeout: 30_000 },
  )

  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
  await page.locator('button[type="submit"]').first().click()

  const response = await passwordGrant
  expect(
    response.ok(),
    `Supabase password grant failed with HTTP ${response.status()}.`,
  ).toBe(true)

  await expect.poll(
    () => authCookieNames(page),
    {
      timeout: 15_000,
      message: 'Supabase accepted the login but did not persist an auth cookie.',
    },
  ).not.toHaveLength(0)

  // Make the protected navigation ourselves after cookie readiness instead of
  // racing the LoginForm's location assignment. page.goto follows redirects, so
  // a stale or server-invisible session fails here with its actual destination.
  await page.goto(destination, { waitUntil: 'domcontentloaded' })

  const actual = new URL(page.url())
  const cookies = await authCookieNames(page)
  expect(
    actual.pathname,
    `Authenticated navigation landed on ${actual.pathname}${actual.search}; auth cookies: ${cookies.join(', ') || 'none'}.`,
  ).toBe(expected.pathname)
  expect(actual.search).toBe(expected.search)
  if (expected.hash) expect(actual.hash).toBe(expected.hash)
}
