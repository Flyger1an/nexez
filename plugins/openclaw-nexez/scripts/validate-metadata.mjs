import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'openclaw.plugin.json'), 'utf8'))
const source = fs.readFileSync(path.join(root, 'src', 'index.ts'), 'utf8')

const expectedTools = [
  'nexez_search',
  'nexez_get_page',
  'nexez_directory',
  'nexez_validate_checkout',
  'nexez_validate_negotiation',
  'nexez_start_checkout',
  'nexez_submit_negotiation',
]

const optionalTools = new Set([
  'nexez_validate_checkout',
  'nexez_validate_negotiation',
  'nexez_start_checkout',
  'nexez_submit_negotiation',
])

assert(pkg.type === 'module', 'package.json must use ESM.')
assert(pkg.openclaw?.extensions?.includes('./dist/index.js'), 'package.json openclaw.extensions must include ./dist/index.js.')
assert(manifest.id === 'nexez', 'Manifest id must be nexez.')
assert(Array.isArray(manifest.contracts?.tools), 'Manifest contracts.tools must be an array.')
assert(JSON.stringify(manifest.contracts.tools) === JSON.stringify(expectedTools), 'Manifest contracts.tools is stale.')

for (const tool of expectedTools) {
  assert(source.includes(`name: '${tool}'`), `Source is missing ${tool}.`)
}

for (const tool of optionalTools) {
  assert(manifest.toolMetadata?.[tool]?.optional === true, `${tool} must be optional in openclaw.plugin.json.`)
  const toolBlock = source.slice(source.indexOf(`name: '${tool}'`), source.indexOf(`name: '${tool}'`) + 900)
  assert(toolBlock.includes('optional: true'), `${tool} must be optional in source.`)
}

assert(source.includes('const approvedCheckoutSchema') && source.includes('userApproved'), 'Approved checkout schema must require userApproved.')
assert(source.includes('const approvedNegotiationSchema') && source.includes('userApproved'), 'Approved negotiation schema must require userApproved.')
assert(toolBlockFor('nexez_start_checkout').includes('parameters: approvedCheckoutSchema'), 'nexez_start_checkout must use approvedCheckoutSchema.')
assert(toolBlockFor('nexez_submit_negotiation').includes('parameters: approvedNegotiationSchema'), 'nexez_submit_negotiation must use approvedNegotiationSchema.')

console.log('OpenClaw Nexez plugin metadata validation ok.')

function assert(condition, message) {
  if (!condition) {
    console.error(message)
    process.exit(1)
  }
}

function toolBlockFor(tool) {
  const start = source.indexOf(`name: '${tool}'`)
  assert(start >= 0, `Source is missing ${tool}.`)
  const next = source.indexOf('\n    tool({', start + 1)
  return source.slice(start, next > start ? next : source.length)
}
