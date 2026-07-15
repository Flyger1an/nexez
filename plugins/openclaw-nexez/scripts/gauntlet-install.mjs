import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const openclaw = path.join(root, 'node_modules', '.bin', 'openclaw')
const scratch = mkdtempSync(path.join(tmpdir(), 'nexez-openclaw-install-gauntlet-'))
const localPackage = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
let publishedVersion
let publishedTools

const candidateTools = [
  'nexez_search',
  'nexez_get_page',
  'nexez_directory',
  'nexez_get_negotiation_status',
  'nexez_wait_for_negotiation_decision',
  'nexez_validate_checkout',
  'nexez_validate_negotiation',
  'nexez_start_checkout',
  'nexez_submit_negotiation',
]

try {
  const candidate = packCandidate()
  const channels = [
    {
      name: 'candidate',
      spec: `npm-pack:${candidate}`,
      installArgs: [],
      expectedVersion: localPackage.version,
    },
    { name: 'npm', spec: 'npm:@nexez/openclaw-nexez', installArgs: ['--pin'] },
    { name: 'clawhub', spec: 'clawhub:@nexez/openclaw-nexez', installArgs: [] },
  ]

  for (const channel of channels) {
    const home = path.join(scratch, channel.name)
    mkdirSync(home, { recursive: true })
    const env = {
      ...process.env,
      HOME: home,
      NO_COLOR: '1',
      OPENCLAW_STATE_DIR: path.join(home, 'state'),
      OPENCLAW_CONFIG_PATH: path.join(home, 'openclaw.json'),
    }

    run(['plugins', 'install', channel.spec, ...channel.installArgs], env)
    const registry = parseJsonOutput(run(['plugins', 'list', '--json'], env))
    const plugin = registry.plugins?.find((entry) => entry.id === 'nexez')

    assert.ok(plugin, `${channel.name} install did not register the Nexez plugin.`)
    assert.equal(plugin.status, 'loaded')
    if (channel.expectedVersion) {
      assert.equal(plugin.version, channel.expectedVersion, 'Release candidate version does not match package.json.')
    } else {
      publishedVersion ||= plugin.version
      assert.equal(plugin.version, publishedVersion, 'npm and ClawHub must resolve the same version.')
    }
    if (channel.expectedVersion) {
      assert.deepEqual(plugin.contracts?.tools, candidateTools)
    } else {
      publishedTools ||= plugin.contracts?.tools
      assert.deepEqual(plugin.contracts?.tools, publishedTools, 'npm and ClawHub must expose the same tool contract.')
    }

    const doctor = run(['plugins', 'doctor'], env)
    assert.match(doctor, /No plugin issues detected\./)
    console.log(`PASS clean ${channel.name} install loaded Nexez ${plugin.version}`)
  }

  console.log(
    `\nOpenClaw clean-install gauntlet passed for candidate ${localPackage.version} and published npm/ClawHub ${publishedVersion}.`,
  )
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

function packCandidate() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const output = execFileSync(npm, ['pack', '--json', '--pack-destination', scratch], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const packed = JSON.parse(output)
  assert.ok(Array.isArray(packed) && typeof packed[0]?.filename === 'string', 'npm pack returned no candidate artifact.')
  return path.join(scratch, packed[0].filename)
}

function run(args, env) {
  try {
    return execFileSync(openclaw, args, {
      cwd: root,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    const stderr = typeof error?.stderr === 'string' ? error.stderr : ''
    throw new Error(`openclaw ${args.join(' ')} failed\n${stdout}\n${stderr}`)
  }
}

function parseJsonOutput(output) {
  const start = output.indexOf('{')
  assert.ok(start >= 0, 'OpenClaw did not return JSON output.')
  return JSON.parse(output.slice(start))
}
