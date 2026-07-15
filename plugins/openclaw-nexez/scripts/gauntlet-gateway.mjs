import assert from 'node:assert/strict'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const openclaw = path.join(root, 'node_modules', '.bin', 'openclaw')
const scratch = mkdtempSync(path.join(tmpdir(), 'nexez-openclaw-gateway-gauntlet-'))
const home = path.join(scratch, 'profile')
const token = 'nexez-openclaw-loopback-gauntlet'
const observed = []
const execFileAsync = promisify(execFile)
let gateway

mkdirSync(home, { recursive: true })

const mock = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const body = await readJsonBody(request)
  observed.push({ method: request.method, pathname: url.pathname, body })

  if (url.pathname === '/api/agent-search') {
    return json(response, 200, {
      schema_version: 'nexez.agent-search.v1',
      result_count: 1,
      results: [],
    })
  }

  if (url.pathname === '/api/negotiations') {
    return json(response, 200, {
      ok: true,
      dryRun: true,
      rulesEvaluation: { decision: 'review', reasons: ['offer_not_negotiable'] },
    })
  }

  return json(response, 500, { error: 'The gateway gauntlet reached an unexpected mutation route.' })
})

try {
  const mockPort = await listenOnRandomPort(mock)
  const gatewayPort = await reservePort()
  const baseUrl = `http://127.0.0.1:${mockPort}`
  const env = {
    ...process.env,
    HOME: home,
    NO_COLOR: '1',
    OPENCLAW_STATE_DIR: path.join(home, 'state'),
    OPENCLAW_CONFIG_PATH: path.join(home, 'openclaw.json'),
  }

  const candidate = packCandidate()
  runOpenClaw(['plugins', 'install', `npm-pack:${candidate}`], env)

  const config = JSON.parse(readFileSync(env.OPENCLAW_CONFIG_PATH, 'utf8'))
  config.gateway = { mode: 'local' }
  config.plugins = {
    ...(config.plugins || {}),
    allow: ['nexez'],
    entries: {
      ...(config.plugins?.entries || {}),
      nexez: {
        enabled: true,
        config: {
          baseUrl,
          userAgent: 'Nexez OpenClaw Gateway Gauntlet/1.0',
        },
      },
    },
  }
  writeFileSync(env.OPENCLAW_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)

  gateway = spawn(
    openclaw,
    [
      'gateway',
      'run',
      '--auth',
      'token',
      '--token',
      token,
      '--bind',
      'loopback',
      '--port',
      String(gatewayPort),
      '--ws-log',
      'compact',
    ],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
  )

  await waitForGateway(gateway)

  const search = await callTool(env, gatewayPort, 'nexez_search', { query: 'gateway fixture', limit: 1 })
  assert.equal(search.ok, true)
  assert.equal(search.source, 'plugin')
  assert.equal(search.output?.details?.schema_version, 'nexez.agent-search.v1')
  console.log('PASS real gateway invokes Nexez discovery as a plugin tool')

  const fixedNegotiation = await callTool(env, gatewayPort, 'nexez_validate_negotiation', {
    slug: 'fixture',
    offer: 'fixed',
    budget: '$500',
  })
  assert.equal(fixedNegotiation.ok, true)
  assert.equal(fixedNegotiation.output?.details?.ok, false)
  assert.match(fixedNegotiation.output?.details?.reason || '', /use checkout/i)
  console.log('PASS real gateway preserves the non-negotiable checkout branch')

  const beforeRefusal = observed.length
  const refusal = await callTool(env, gatewayPort, 'nexez_start_checkout', {
    slug: 'must-not-reach-network',
    offer: 'services-0',
    userApproved: false,
  })
  assert.equal(refusal.ok, false)
  assert.match(refusal.error?.message || '', /userApproved: true/)
  assert.equal(observed.length, beforeRefusal)
  console.log('PASS real gateway surfaces approval refusal without a network call')

  console.log('\nOpenClaw loopback gateway gauntlet passed with 0 mutations.')
} finally {
  await stopGateway(gateway)
  await closeServer(mock)
  rmSync(scratch, { recursive: true, force: true })
}

async function callTool(env, port, name, args) {
  const command = [
    'gateway',
    'call',
    'tools.invoke',
    '--url',
    `ws://127.0.0.1:${port}`,
    '--token',
    token,
    '--params',
    JSON.stringify({ name, args }),
    '--json',
  ]
  try {
    const { stdout } = await execFileAsync(openclaw, command, {
      cwd: root,
      encoding: 'utf8',
      env,
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    })
    return parseJsonOutput(stdout)
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    const stderr = typeof error?.stderr === 'string' ? error.stderr : ''
    throw new Error(`openclaw ${command.join(' ')} failed\n${stdout}\n${stderr}`)
  }
}

function packCandidate() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const output = execFileSync(npm, ['pack', '--json', '--pack-destination', scratch], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const packed = JSON.parse(output)
  assert.ok(Array.isArray(packed) && typeof packed[0]?.filename === 'string')
  return path.join(scratch, packed[0].filename)
}

function runOpenClaw(args, env) {
  try {
    return execFileSync(openclaw, args, {
      cwd: root,
      encoding: 'utf8',
      env,
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : ''
    const stderr = typeof error?.stderr === 'string' ? error.stderr : ''
    throw new Error(`openclaw ${args.join(' ')} failed\n${stdout}\n${stderr}`)
  }
}

function waitForGateway(child) {
  return new Promise((resolve, reject) => {
    let output = ''
    const timeout = setTimeout(() => reject(new Error(`OpenClaw gateway did not become ready.\n${output}`)), 20_000)
    const onData = (chunk) => {
      output = `${output}${chunk}`.slice(-12_000)
      if (output.includes('[gateway] ready')) {
        clearTimeout(timeout)
        resolve()
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`OpenClaw gateway exited before ready with code ${code}.\n${output}`))
    })
  })
}

async function stopGateway(child) {
  if (!child || child.exitCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGINT')
  const timeout = new Promise((resolve) => setTimeout(resolve, 5_000, 'timeout'))
  if ((await Promise.race([exited, timeout])) === 'timeout' && child.exitCode === null) {
    child.kill('SIGTERM')
    await once(child, 'exit')
  }
}

async function reservePort() {
  const server = createServer()
  const port = await listenOnRandomPort(server)
  await closeServer(server)
  return port
}

function listenOnRandomPort(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      assert.ok(address && typeof address === 'object')
      resolve(address.port)
    })
  })
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

async function readJsonBody(request) {
  if (request.method !== 'POST') return {}
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

function parseJsonOutput(output) {
  const start = output.indexOf('{')
  assert.ok(start >= 0, 'OpenClaw did not return JSON output.')
  return JSON.parse(output.slice(start))
}
