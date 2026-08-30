const APP_BUNDLE_ID = 'app.nexez.nexie'
const APP_PACKAGE = 'app.nexez.nexie'
const TEAM_ID_RE = /^[A-Z0-9]{10}$/
const SHA256_RE = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/

export function buildNexxiAppleAppSiteAssociation(teamIdValue: unknown) {
  const teamId = typeof teamIdValue === 'string' ? teamIdValue.trim().toUpperCase() : ''
  if (!TEAM_ID_RE.test(teamId)) return null
  return {
    applinks: {
      apps: [],
      details: [{
        appIDs: [`${teamId}.${APP_BUNDLE_ID}`],
        components: [{ '/': '/nexxi/*', comment: 'Open Nexxi native destinations and checkout returns.' }],
      }],
    },
  }
}

export function buildNexxiAndroidAssetLinks(fingerprintValue: unknown) {
  const fingerprints = typeof fingerprintValue === 'string'
    ? [...new Set(fingerprintValue
        .split(',')
        .map((value) => value.trim().toUpperCase())
        .filter((value) => SHA256_RE.test(value)))]
    : []
  if (!fingerprints.length) return null
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: APP_PACKAGE,
      sha256_cert_fingerprints: fingerprints,
    },
  }]
}
