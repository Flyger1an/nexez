type ExpoProjectConfig = {
  expoConfig?: { extra?: { eas?: { projectId?: unknown } } } | null
  easConfig?: { projectId?: unknown } | null
}

export function resolveExpoProjectId(constants: ExpoProjectConfig): string | null {
  const value = constants.expoConfig?.extra?.eas?.projectId ?? constants.easConfig?.projectId
  return typeof value === 'string' && value.trim() ? value : null
}
