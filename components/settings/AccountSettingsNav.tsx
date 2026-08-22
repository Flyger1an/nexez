'use client'

import { useEffect, useState } from 'react'
import { Bot, Building2, Database, LockKeyhole, Users } from 'lucide-react'
import { SettingsNav, type SettingsNavItem } from './SettingsPrimitives'

const ACCOUNT_SETTINGS_SECTIONS = [
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'security', label: 'Profile & security', icon: LockKeyhole },
  { id: 'team', label: 'Team access', icon: Users },
  { id: 'data', label: 'Data controls', icon: Database },
  { id: 'agent-surfaces', label: 'Agent surfaces', icon: Bot },
] as const satisfies readonly SettingsNavItem[]

type AccountSettingsSectionId = (typeof ACCOUNT_SETTINGS_SECTIONS)[number]['id']
const ACCOUNT_SETTINGS_SECTION_IDS = ACCOUNT_SETTINGS_SECTIONS.map((section) => section.id)

/** Keeps icon components inside the client boundary while the settings page remains server-rendered. */
export function AccountSettingsNav() {
  const [activeId, setActiveId] = useState<AccountSettingsSectionId>('workspace')

  useEffect(() => {
    let frame = 0

    const updateFromScroll = () => {
      frame = 0
      const marker = Math.min(240, window.innerHeight * 0.28)
      let next: AccountSettingsSectionId = ACCOUNT_SETTINGS_SECTION_IDS[0]

      for (const sectionId of ACCOUNT_SETTINGS_SECTION_IDS) {
        const section = document.getElementById(sectionId)
        if (section && section.getBoundingClientRect().top <= marker) next = sectionId
      }

      const documentHeight = document.documentElement.scrollHeight
      if (window.scrollY + window.innerHeight >= documentHeight - 4) {
        next = ACCOUNT_SETTINGS_SECTION_IDS[ACCOUNT_SETTINGS_SECTION_IDS.length - 1]
      }

      setActiveId((current) => current === next ? current : next)
    }

    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateFromScroll)
    }

    const syncFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1))
      if (ACCOUNT_SETTINGS_SECTION_IDS.includes(hash as AccountSettingsSectionId)) {
        setActiveId(hash as AccountSettingsSectionId)
      }
      requestUpdate()
    }

    syncFromHash()
    window.addEventListener('scroll', requestUpdate, { passive: true })
    window.addEventListener('resize', requestUpdate)
    window.addEventListener('hashchange', syncFromHash)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', requestUpdate)
      window.removeEventListener('resize', requestUpdate)
      window.removeEventListener('hashchange', syncFromHash)
    }
  }, [])

  return (
    <SettingsNav
      items={ACCOUNT_SETTINGS_SECTIONS}
      activeId={activeId}
      onNavigate={(id) => setActiveId(id as AccountSettingsSectionId)}
      ariaLabel="Settings sections"
    />
  )
}
