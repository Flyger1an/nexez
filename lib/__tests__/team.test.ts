import { describe, expect, it } from 'vitest'
import { isValidEmail, roleLabel, TEAM_ROLES } from '../team'

describe('team helpers', () => {
  it('validates emails', () => {
    expect(isValidEmail('a@b.com')).toBe(true)
    expect(isValidEmail('  x@y.co  ')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })
  it('labels roles', () => {
    expect(roleLabel('editor')).toContain('edit')
    expect(roleLabel('viewer')).toContain('read-only')
    expect(TEAM_ROLES).toEqual(['editor', 'viewer'])
  })
})
