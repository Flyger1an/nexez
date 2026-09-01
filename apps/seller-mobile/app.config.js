// Inject the native Firebase client configs without committing them.
// EAS materializes the file variables during builds. Local builds use the
// gitignored files in this directory.
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...(config.ios || {}),
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? './GoogleService-Info.plist',
  },
  android: {
    ...(config.android || {}),
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
})
