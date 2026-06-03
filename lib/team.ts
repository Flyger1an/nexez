// Team invites — pure helpers (validation + display). Access enforcement is a
// separate, deliberate RLS step; these helpers just support invite management.

export type TeamRole = 'editor' | 'viewer'

export function isValidEmail(email: string): boolean {
  const e = (email || '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export function roleLabel(role: TeamRole): string {
  return role === 'editor' ? 'Editor — can edit pages' : 'Viewer — read-only'
}

export const TEAM_ROLES: TeamRole[] = ['editor', 'viewer']
