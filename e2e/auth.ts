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

function destinationMatches(actual: URL, expected: URL): boolean {
  return actual.pathname === expected.pathname
    && actual.search === expected.search
    && (!expected.hash || actual.hash === expected.hash)
}

async function authCookieNames(page: Page): Promise<string[]> {
  return (await page.context().cookies())
    .filter((cookie) => AUTH_COOKIE_NAME.test(cookie.name) && cookie.value.length > 0)
    .map((cookie) => cookie.name)
    .sort()
}

/**
 * Uses the real Nexez password form and waits for its one real redirect. Older
 * helpers treated any exit from /login as success and then issued a second
 * page.goto while the first navigation was still settling. That could abort a
 * valid authenticated navigation or accept onboarding as a protected session.
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
  const protectedLanding = page.waitForURL(
    (url) => destinationMatches(url, expected),
    { timeout: 30_000, waitUntil: 'domcontentloaded' },
  )

  await page.locator('input[type="email"]').fill(options.email)
  await page.locator('input[type="password"]').fill(options.password)
  await page.locator('button[type="submit"]').first().click()

  const response = await passwordGrant
  expect(
    response.ok(),
    `Supabase password grant failed with HTTP ${response.status()}.`,
  ).toBe(true)

  try {
    await protectedLanding
  } catch (error) {
    const cookies = await authCookieNames(page)
    const actual = new URL(page.url())
    throw new Error(
      `Authenticated navigation did not reach ${expected.pathname}${expected.search}${expected.hash}. `
      + `Landed on ${actual.pathname}${actual.search}${actual.hash}; auth cookies: `
      + `${cookies.join(', ') || 'none'}.`,
      { cause: error },
    )
  }

  await expect.poll(
    () => authCookieNames(page),
    {
      timeout: 15_000,
      message: 'Supabase accepted the login but did not retain an auth cookie.',
    },
  ).not.toHaveLength(0)
}
