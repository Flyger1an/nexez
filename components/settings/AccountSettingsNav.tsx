'use client'

import { Bot, Building2, Database, LockKeyhole, Users } from 'lucide-react'
import { SettingsNav, type SettingsNavItem } from './SettingsPrimitives'

const ACCOUNT_SETTINGS_SECTIONS: SettingsNavItem[] = [
  { id: 'workspace', label: 'Workspace', icon: Building2 },
  { id: 'security', label: 'Profile & security', icon: LockKeyhole },
  { id: 'team', label: 'Team access', icon: Users },
  { id: 'data', label: 'Data controls', icon: Database },
  { id: 'agent-surfaces', label: 'Agent surfaces', icon: Bot },
]

/** Keeps icon components inside the client boundary while the settings page remains server-rendered. */
export function AccountSettingsNav() {
  return <SettingsNav items={ACCOUNT_SETTINGS_SECTIONS} ariaLabel="Settings sections" />
}
