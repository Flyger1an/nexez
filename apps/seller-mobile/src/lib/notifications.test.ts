import { describe, expect, it } from 'vitest'
import { resolveExpoProjectId } from './expo-project'

describe('resolveExpoProjectId', () => {
  it('prefers the app config project ID embedded by EAS', () => {
    expect(resolveExpoProjectId({
      expoConfig: { extra: { eas: { projectId: 'app-config-id' } } },
      easConfig: { projectId: 'eas-config-id' },
    })).toBe('app-config-id')
  })

  it('falls back to the native EAS config', () => {
    expect(resolveExpoProjectId({ easConfig: { projectId: 'eas-config-id' } })).toBe('eas-config-id')
  })

  it.each([
    {},
    { expoConfig: { extra: { eas: { projectId: '' } } } },
    { expoConfig: { extra: { eas: { projectId: 42 } } } },
  ])('rejects a missing or invalid project ID', (constants) => {
    expect(resolveExpoProjectId(constants)).toBeNull()
  })
})
