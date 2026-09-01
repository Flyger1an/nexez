// Sentry's Metro wrapper stamps Debug IDs into JavaScript bundles and source
// maps. EAS uploads those maps when SENTRY_AUTH_TOKEN is present.
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const config = getSentryExpoConfig(__dirname)

module.exports = config
