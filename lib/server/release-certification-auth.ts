import 'server-only'

import { readBearerToken, verifyBearerToken } from '../commerce/inbound-auth'

const MIN_SECRET_LENGTH = 32

export function hasReleaseCertificationSecret(): boolean {
  return Boolean(readReleaseCertificationSecret())
}

export function authorizeReleaseCertificationRequest(request: Request): boolean {
  return verifyBearerToken(readBearerToken(request), readReleaseCertificationSecret())
}

function readReleaseCertificationSecret(): string | null {
  const value = process.env.NEXEZ_RELEASE_CERT_SECRET?.trim() || ''
  return value.length >= MIN_SECRET_LENGTH ? value : null
}
