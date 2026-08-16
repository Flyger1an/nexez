#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const typescriptPackage = readJson('sdk/typescript/package.json')
const typescriptLock = readJson('sdk/typescript/package-lock.json')
const pythonSource = readFileSync('sdk/python/src/nexez_agent_sdk/__init__.py', 'utf8')
const pythonVersion = pythonSource.match(/^__version__\s*=\s*["']([^"']+)["']/m)?.[1]
// The advertised versions every public surface (llms.txt, /.well-known/*,
// openapi.json, agent-pages.json) serves come from lib/agent-distribution.ts.
// Check them here too so they can't drift from the shipped SDKs.
const typescriptSource = readFileSync('sdk/typescript/src/index.ts', 'utf8')
const typescriptSourceVersion = typescriptSource.match(/NEXEZ_SDK_VERSION = '([^']+)'/)?.[1]
const distributionSource = readFileSync('lib/agent-distribution.ts', 'utf8')
const distributionTypescriptVersion = distributionSource.match(
  /NEXEZ_TYPESCRIPT_SDK\s*=\s*\{[\s\S]*?version:\s*'([^']+)'/,
)?.[1]
const distributionPythonVersion = distributionSource.match(
  /NEXEZ_PYTHON_SDK\s*=\s*\{[\s\S]*?version:\s*'([^']+)'/,
)?.[1]

const versions = {
  'TypeScript package': typescriptPackage.version,
  'TypeScript lockfile': typescriptLock.version,
  'TypeScript lockfile root': typescriptLock.packages?.['']?.version,
  'TypeScript source constant': typescriptSourceVersion,
  'Python package': pythonVersion,
  'agent-distribution.ts TypeScript': distributionTypescriptVersion,
  'agent-distribution.ts Python': distributionPythonVersion,
}

const invalid = Object.entries(versions).filter(
  ([, version]) => typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version),
)
if (invalid.length) {
  fail(`Invalid or missing SDK version: ${invalid.map(([label, version]) => `${label}=${String(version)}`).join(', ')}`)
}

const uniqueVersions = new Set(Object.values(versions))
if (uniqueVersions.size !== 1) {
  fail(`SDK versions are out of sync: ${Object.entries(versions).map(([label, version]) => `${label}=${version}`).join(', ')}`)
}

if (typescriptPackage.name !== '@nexez/agent-sdk' || typescriptLock.name !== typescriptPackage.name) {
  fail('TypeScript SDK package and lockfile names are out of sync.')
}

// ── OpenClaw plugin ────────────────────────────────────────────────────────────
// Versioned independently of the SDKs, so it gets its own group rather than being
// folded into the set above.
//
// This exists because 0.2.1 shipped to npm reporting itself as 0.2.0: the publish ran
// from a tree where the bump had not landed, and package.json disagreed with the
// hardcoded source constant with nothing to catch it. The constant now derives from
// package.json, and the assertion below keeps it that way. At the time of writing the
// lockfile had never been bumped past 0.2.0 either.
const pluginPackage = readJson('plugins/openclaw-nexez/package.json')
const pluginLock = readJson('plugins/openclaw-nexez/package-lock.json')
const pluginManifest = readJson('plugins/openclaw-nexez/openclaw.plugin.json')
const distributionPluginVersion = distributionSource.match(
  /NEXEZ_OPENCLAW_PLUGIN\s*=\s*\{[\s\S]*?version:\s*'([^']+)'/,
)?.[1]

const pluginVersions = {
  'plugin package': pluginPackage.version,
  'plugin lockfile': pluginLock.version,
  'plugin lockfile root': pluginLock.packages?.['']?.version,
  'plugin manifest': pluginManifest.version,
  'agent-distribution.ts OpenClaw plugin': distributionPluginVersion,
}

const invalidPlugin = Object.entries(pluginVersions).filter(
  ([, version]) => typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version),
)
if (invalidPlugin.length) {
  fail(
    `Invalid or missing OpenClaw plugin version: ${invalidPlugin.map(([label, version]) => `${label}=${String(version)}`).join(', ')}`,
  )
}

if (new Set(Object.values(pluginVersions)).size !== 1) {
  fail(
    `OpenClaw plugin versions are out of sync: ${Object.entries(pluginVersions).map(([label, version]) => `${label}=${version}`).join(', ')}`,
  )
}

// The runtime constant must stay DERIVED. A literal here is the exact shape of the
// bug this group was added for, and it is invisible to the sync check above because a
// stale literal agrees with itself.
const pluginClientSource = readFileSync('plugins/openclaw-nexez/src/nexez-client.ts', 'utf8')
if (/NEXEZ_PLUGIN_VERSION\s*(?::\s*string\s*)?=\s*['"]/.test(pluginClientSource)) {
  fail(
    'NEXEZ_PLUGIN_VERSION is hardcoded in plugins/openclaw-nexez/src/nexez-client.ts. ' +
      'Derive it from package.json instead, or a publish from a stale tree will ship the wrong version in x-nexez-client.',
  )
}

console.log(`Agent SDK source versions match: ${typescriptPackage.version}`)
console.log(`OpenClaw plugin source versions match: ${pluginPackage.version}`)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
