import { describe, expect, it } from 'vitest'
import {
  buildNexxiAndroidAssetLinks,
  buildNexxiAppleAppSiteAssociation,
} from './nexxi-app-association'

const FINGERPRINT = Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, '0')).join(':').toUpperCase()

describe('Nexxi app association files', () => {
  it('builds a path-scoped AASA document from a valid Apple Team ID', () => {
    expect(buildNexxiAppleAppSiteAssociation(' ab12cd34ef ')).toEqual({
      applinks: {
        apps: [],
        details: [{
          appIDs: ['AB12CD34EF.app.nexez.nexxi'],
          components: [{ '/': '/nexxi/*', comment: 'Open Nexxi native destinations and checkout returns.' }],
        }],
      },
    })
    expect(buildNexxiAppleAppSiteAssociation('placeholder')).toBeNull()
  })

  it('normalizes, validates, and deduplicates Android signing fingerprints', () => {
    expect(buildNexxiAndroidAssetLinks(`${FINGERPRINT.toLowerCase()}, ${FINGERPRINT}, invalid`)).toEqual([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'app.nexez.nexxi',
        sha256_cert_fingerprints: [FINGERPRINT],
      },
    }])
    expect(buildNexxiAndroidAssetLinks('')).toBeNull()
  })
})
