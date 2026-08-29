import { expect, type Page } from '@playwright/test'

export async function selectPlatformTheme(page: Page, theme: 'Light' | 'Dark') {
  const themeChoice = page.getByRole('menuitemradio', { name: `${theme} theme`, exact: true })
  if (!(await themeChoice.isVisible())) {
    // Next's local development toolbar sits over the bottom-left rail. It is
    // absent in production. Opening by keyboard also verifies the real menu's
    // accessible trigger without routing a pointer event through that overlay.
    const accountTrigger = page.getByRole('button', { name: 'Open account menu', exact: true })
    await accountTrigger.focus()
    await accountTrigger.press('Enter')
  }

  await expect(themeChoice).toBeVisible()
  await themeChoice.click()
  await page.keyboard.press('Escape')
  await expect(themeChoice).toBeHidden()
}
