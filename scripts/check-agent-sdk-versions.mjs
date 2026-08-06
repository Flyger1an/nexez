#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const typescriptPackage = readJson('sdk/typescript/package.json')
const typescriptLock = readJson('sdk/typescript/package-lock.json')
const pythonSource = readFileSync('sdk/python/src/nexez_agent_sdk/__init__.py', 'utf8')
const pythonVersion = pythonSource.match(/^__version__\s*=\s*["']([^"']+)["']/m)?.[1]
// The advertised versions every public surface (llms.txt, /.well-known/*,
// openapi.json, agent-pages.json) serves come from lib/agent-distribution.ts.
// Check them here too so they can't drift from the shipped SDKs.
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

console.log(`Agent SDK source versions match: ${typescriptPackage.version}`)

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
