export const A2A_AGENT_CARD_PROFILE = '1.0' as const
export const A2A_AGENT_CARD_SPEC_RELEASE = 'v1.0.1' as const
export const MAX_A2A_AGENT_CARD_BYTES = 64 * 1024

const LIMITS = {
  issues: 64,
  interfaces: 16,
  skills: 64,
  modes: 16,
  schemes: 16,
  requirements: 16,
  extensions: 32,
  signatures: 8,
} as const

const CORE_BINDINGS = new Set(['JSONRPC', 'GRPC', 'HTTP+JSON'])
const NEXEZ_BINDINGS = new Set(['JSONRPC'])
const SECURITY_VARIANTS = [
  'apiKeySecurityScheme',
  'httpAuthSecurityScheme',
  'oauth2SecurityScheme',
  'openIdConnectSecurityScheme',
  'mtlsSecurityScheme',
] as const
const LEGACY_FIELDS = [
  'protocolVersion',
  'url',
  'preferredTransport',
  'security',
  'additionalInterfaces',
] as const

type JsonRecord = Record<string, unknown>
type SecurityVariant = (typeof SECURITY_VARIANTS)[number]

export type A2AAgentCardIssue = {
  level: 'error' | 'warning'
  code: string
  path: string
  message: string
}

export type A2AAgentInterfaceSummary = {
  url: string
  protocolBinding: string
  protocolVersion: string
  tenant: string | null
  compatible: boolean
}

export type A2AAgentCardConformance = {
  profile: `a2a-${typeof A2A_AGENT_CARD_PROFILE}`
  specRelease: typeof A2A_AGENT_CARD_SPEC_RELEASE
  valid: boolean
  compatible: boolean
  preferredInterface: A2AAgentInterfaceSummary | null
  selectedInterface: A2AAgentInterfaceSummary | null
  interfaces: A2AAgentInterfaceSummary[]
  protocolVersions: string[]
  capabilities: {
    streaming: boolean
    pushNotifications: boolean
    extendedAgentCard: boolean
    requiredExtensions: string[]
  }
  inputModes: string[]
  outputModes: string[]
  security: {
    authenticated: boolean
    allowsAnonymous: boolean
    schemes: string[]
    requirementCount: number
  }
  skillCount: number
  compatibleSkillCount: number
  signatures: { count: number; verified: false }
  issues: A2AAgentCardIssue[]
}

class Findings {
  readonly issues: A2AAgentCardIssue[] = []
  hasError = false

  add(
    level: A2AAgentCardIssue['level'],
    code: string,
    path: string,
    message: string,
  ): void {
    if (level === 'error') this.hasError = true
    if (this.issues.length >= LIMITS.issues) return
    this.issues.push({ level, code, path, message })
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function has(source: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function stringValue(
  source: JsonRecord,
  key: string,
  path: string,
  findings: Findings,
  required = true,
  max = 2_048,
): string | null {
  if (!has(source, key) || source[key] === null) {
    if (required) findings.add('error', 'required_string', path, `${path} is required.`)
    return null
  }
  const value = source[key]
  if (typeof value !== 'string' || !value.trim()) {
    findings.add('error', 'invalid_string', path, `${path} must be a non-empty string.`)
    return null
  }
  const normalized = value.trim()
  if (normalized.length > max) {
    findings.add('error', 'string_too_long', path, `${path} exceeds ${max} characters.`)
  }
  return normalized
}

function booleanValue(
  source: JsonRecord,
  key: string,
  path: string,
  findings: Findings,
): boolean {
  if (!has(source, key)) return false
  if (typeof source[key] !== 'boolean') {
    findings.add('error', 'invalid_boolean', path, `${path} must be true or false.`)
    return false
  }
  return source[key]
}

function stringList(
  value: unknown,
  path: string,
  findings: Findings,
  max: number,
  required = false,
): string[] {
  if (value === undefined || value === null) {
    if (required) findings.add('error', 'required_array', path, `${path} is required.`)
    return []
  }
  if (!Array.isArray(value)) {
    findings.add('error', 'invalid_array', path, `${path} must be an array.`)
    return []
  }
  if (required && value.length === 0) {
    findings.add('error', 'empty_array', path, `${path} must not be empty.`)
  }
  if (value.length > max) {
    findings.add('error', 'array_too_large', path, `${path} exceeds ${max} values.`)
  }

  const output: string[] = []
  const seen = new Set<string>()
  value.slice(0, max).forEach((item, index) => {
    if (typeof item !== 'string' || !item.trim()) {
      findings.add('error', 'invalid_array_value', `${path}[${index}]`, 'Value must be a non-empty string.')
      return
    }
    const normalized = item.trim()
    if (seen.has(normalized)) {
      findings.add('warning', 'duplicate_array_value', `${path}[${index}]`, `Duplicate value: ${normalized}.`)
      return
    }
    seen.add(normalized)
    output.push(normalized)
  })
  return output
}

function hasTextMode(modes: string[]): boolean {
  return modes.some((mode) => mode.toLowerCase().startsWith('text/'))
}

function blockedIpv4(host: string): boolean {
  const values = host.split('.').map(Number)
  if (values.length !== 4 || values.some((value) => value < 0 || value > 255)) return true
  const [a, b, c] = values
  return a === 0
    || a === 10
    || a === 100 && b >= 64 && b <= 127
    || a === 127
    || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 0 && c === 0
    || a === 192 && b === 0 && c === 2
    || a === 192 && b === 168
    || a === 198 && b >= 18 && b <= 19
    || a === 198 && b === 51 && c === 100
    || a === 203 && b === 0 && c === 113
    || a >= 224
}

function mappedIpv4(host: string): string | null {
  const lower = host.toLowerCase()
  if (!lower.startsWith('::ffff:')) return null
  const tail = lower.slice(7)
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(tail)) return tail
  const words = tail.split(':')
  if (words.length !== 2 || words.some((word) => !/^[0-9a-f]{1,4}$/.test(word))) return null
  const high = Number.parseInt(words[0]!, 16)
  const low = Number.parseInt(words[1]!, 16)
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
}

function blockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return false
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return blockedIpv4(host)
  if (host.includes(':')) {
    const mapped = mappedIpv4(host)
    if (mapped) return blockedIpv4(mapped)
    return host === '::'
      || host === '::1'
      || /^(?:fc|fd)/.test(host)
      || /^fe[89ab]/.test(host)
      || /^ff/.test(host)
      || /^2001:db8(?::|$)/.test(host)
  }
  return host.endsWith('.local')
    || host.endsWith('.internal')
    || host.endsWith('.home.arpa')
}

function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(host)
}

function safeHttpUrl(
  value: string | null,
  path: string,
  findings: Findings,
): string | null {
  if (!value) return null
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    findings.add('error', 'invalid_url', path, `${path} must be an absolute URL.`)
    return null
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    findings.add('error', 'invalid_url_protocol', path, `${path} must use HTTP or HTTPS.`)
  }
  if (parsed.username || parsed.password) {
    findings.add('error', 'url_credentials', path, `${path} must not contain credentials.`)
  }
  if (parsed.hash) {
    findings.add('error', 'url_fragment', path, `${path} must not contain a fragment.`)
  }

  const loopback = isLoopback(parsed.hostname)
  if (!loopback && blockedHost(parsed.hostname)) {
    findings.add('error', 'private_endpoint', path, `${path} must identify a publicly routable host.`)
  }
  if (parsed.protocol === 'http:' && loopback) {
    findings.add('warning', 'local_http_endpoint', path, 'HTTP is accepted only for loopback development.')
  } else if (parsed.protocol !== 'https:') {
    findings.add('error', 'insecure_endpoint', path, `${path} must use HTTPS in production.`)
  }
  return parsed.toString()
}

function inspectInterfaces(value: unknown, findings: Findings): A2AAgentInterfaceSummary[] {
  if (!Array.isArray(value)) {
    findings.add('error', 'required_interfaces', 'supportedInterfaces', 'supportedInterfaces must be an array.')
    return []
  }
  if (value.length === 0) {
    findings.add('error', 'empty_interfaces', 'supportedInterfaces', 'At least one interface is required.')
  }
  if (value.length > LIMITS.interfaces) {
    findings.add('error', 'too_many_interfaces', 'supportedInterfaces', 'Too many interfaces are advertised.')
  }

  const output: A2AAgentInterfaceSummary[] = []
  const seen = new Set<string>()
  value.slice(0, LIMITS.interfaces).forEach((entry, index) => {
    const path = `supportedInterfaces[${index}]`
    if (!isRecord(entry)) {
      findings.add('error', 'invalid_interface', path, 'Interface must be an object.')
      return
    }
    const url = safeHttpUrl(stringValue(entry, 'url', `${path}.url`, findings), `${path}.url`, findings)
    const binding = stringValue(entry, 'protocolBinding', `${path}.protocolBinding`, findings, true, 64)?.toUpperCase() ?? ''
    const version = stringValue(entry, 'protocolVersion', `${path}.protocolVersion`, findings, true, 32) ?? ''
    const tenant = stringValue(entry, 'tenant', `${path}.tenant`, findings, false, 200)
    if (binding && !CORE_BINDINGS.has(binding)) {
      findings.add('warning', 'unknown_protocol_binding', `${path}.protocolBinding`, `Unknown binding: ${binding}.`)
    }
    if (version && version !== A2A_AGENT_CARD_PROFILE) {
      findings.add('warning', 'unsupported_protocol_version', `${path}.protocolVersion`, 'Nexez currently supports A2A 1.0 peers.')
    }
    if (!url || !binding || !version) return
    const identity = `${url}|${binding}|${version}|${tenant ?? ''}`
    if (seen.has(identity)) findings.add('warning', 'duplicate_interface', path, 'Duplicate interface declaration.')
    seen.add(identity)
    output.push({
      url,
      protocolBinding: binding,
      protocolVersion: version,
      tenant,
      compatible: NEXEZ_BINDINGS.has(binding) && version === A2A_AGENT_CARD_PROFILE,
    })
  })

  const firstCompatible = output.findIndex((entry) => entry.compatible)
  if (firstCompatible < 0) {
    findings.add('warning', 'no_compatible_interface', 'supportedInterfaces', 'No A2A 1.0 JSON-RPC interface is available.')
  } else if (firstCompatible > 0) {
    findings.add('warning', 'preferred_interface_not_compatible', 'supportedInterfaces[0]', 'The preferred interface is not supported by Nexez.')
  }
  return output
}

function inspectCapabilities(value: unknown, findings: Findings) {
  const result = {
    streaming: false,
    pushNotifications: false,
    extendedAgentCard: false,
    requiredExtensions: [] as string[],
  }
  if (!isRecord(value)) {
    findings.add('error', 'required_capabilities', 'capabilities', 'capabilities must be an object.')
    return result
  }
  if (has(value, 'stateTransitionHistory')) {
    findings.add('error', 'legacy_field', 'capabilities.stateTransitionHistory', 'stateTransitionHistory is not an A2A 1.0 capability.')
  }
  result.streaming = booleanValue(value, 'streaming', 'capabilities.streaming', findings)
  result.pushNotifications = booleanValue(value, 'pushNotifications', 'capabilities.pushNotifications', findings)
  result.extendedAgentCard = booleanValue(value, 'extendedAgentCard', 'capabilities.extendedAgentCard', findings)

  if (value.extensions !== undefined) {
    if (!Array.isArray(value.extensions)) {
      findings.add('error', 'invalid_extensions', 'capabilities.extensions', 'extensions must be an array.')
    } else {
      if (value.extensions.length > LIMITS.extensions) {
        findings.add('error', 'too_many_extensions', 'capabilities.extensions', 'Too many extensions are advertised.')
      }
      value.extensions.slice(0, LIMITS.extensions).forEach((extension, index) => {
        const path = `capabilities.extensions[${index}]`
        if (!isRecord(extension)) {
          findings.add('error', 'invalid_extension', path, 'Extension must be an object.')
          return
        }
        const uri = stringValue(extension, 'uri', `${path}.uri`, findings)
        if (uri && !/^[a-z][a-z0-9+.-]*:/i.test(uri)) {
          findings.add('error', 'invalid_uri', `${path}.uri`, 'Extension URI must be absolute.')
        }
        const required = booleanValue(extension, 'required', `${path}.required`, findings)
        if (required && uri) {
          result.requiredExtensions.push(uri)
          findings.add('warning', 'required_extension_not_supported', `${path}.required`, 'Nexez does not enable peer-required extensions yet.')
        }
        if (has(extension, 'params') && !isRecord(extension.params)) {
          findings.add('error', 'invalid_extension_params', `${path}.params`, 'params must be an object.')
        }
      })
    }
  }
  return result
}

function inspectScheme(value: unknown, path: string, findings: Findings): void {
  if (!isRecord(value)) {
    findings.add('error', 'invalid_security_scheme', path, 'Security scheme must be an object.')
    return
  }
  const variants = SECURITY_VARIANTS.filter((key) => has(value, key))
  if (variants.length !== 1) {
    findings.add('error', 'security_scheme_oneof', path, 'Exactly one A2A security scheme variant is required.')
    return
  }
  const variant: SecurityVariant = variants[0]!
  const payload = value[variant]
  if (!isRecord(payload)) {
    findings.add('error', 'invalid_security_scheme_payload', `${path}.${variant}`, 'Scheme payload must be an object.')
    return
  }
  if (variant === 'apiKeySecurityScheme') {
    const location = stringValue(payload, 'location', `${path}.${variant}.location`, findings, true, 16)?.toLowerCase()
    if (location && !['query', 'header', 'cookie'].includes(location)) {
      findings.add('error', 'invalid_api_key_location', `${path}.${variant}.location`, 'API key location must be query, header, or cookie.')
    }
    stringValue(payload, 'name', `${path}.${variant}.name`, findings, true, 160)
  } else if (variant === 'httpAuthSecurityScheme') {
    stringValue(payload, 'scheme', `${path}.${variant}.scheme`, findings, true, 64)
  } else if (variant === 'openIdConnectSecurityScheme') {
    safeHttpUrl(
      stringValue(payload, 'openIdConnectUrl', `${path}.${variant}.openIdConnectUrl`, findings),
      `${path}.${variant}.openIdConnectUrl`,
      findings,
    )
  } else if (variant === 'oauth2SecurityScheme' && !isRecord(payload.flows)) {
    findings.add('error', 'required_oauth_flows', `${path}.${variant}.flows`, 'OAuth flows must be an object.')
  }
}

function inspectRequirements(
  value: unknown,
  path: string,
  schemes: Set<string>,
  findings: Findings,
): { count: number; allowsAnonymous: boolean; hasAuthenticated: boolean } {
  if (value === undefined || value === null) {
    return { count: 0, allowsAnonymous: true, hasAuthenticated: false }
  }
  if (!Array.isArray(value)) {
    findings.add('error', 'invalid_security_requirements', path, `${path} must be an array.`)
    return { count: 0, allowsAnonymous: true, hasAuthenticated: false }
  }
  if (value.length > LIMITS.requirements) {
    findings.add('error', 'too_many_security_requirements', path, 'Too many security requirements are advertised.')
  }
  let allowsAnonymous = value.length === 0
  let hasAuthenticated = false
  value.slice(0, LIMITS.requirements).forEach((requirement, index) => {
    const itemPath = `${path}[${index}]`
    if (!isRecord(requirement) || !isRecord(requirement.schemes)) {
      findings.add('error', 'invalid_security_requirement', itemPath, 'Requirement must contain a schemes object.')
      return
    }
    const entries = Object.entries(requirement.schemes)
    if (entries.length === 0) {
      allowsAnonymous = true
      return
    }
    let known = true
    for (const [name, scopes] of entries) {
      if (!schemes.has(name)) {
        known = false
        findings.add('error', 'unknown_security_requirement', `${itemPath}.schemes.${name}`, `Unknown security scheme: ${name}.`)
      }
      if (!isRecord(scopes)) {
        findings.add('error', 'invalid_security_scope_list', `${itemPath}.schemes.${name}`, 'Scope list must be an object.')
        continue
      }
      stringList(scopes.list, `${itemPath}.schemes.${name}.list`, findings, 32)
    }
    if (known) hasAuthenticated = true
  })
  return {
    count: Math.min(value.length, LIMITS.requirements),
    allowsAnonymous,
    hasAuthenticated,
  }
}

function inspectSecurity(card: JsonRecord, findings: Findings) {
  if (card.securitySchemes === undefined) {
    if (card.securityRequirements !== undefined) {
      findings.add('error', 'security_requirements_without_schemes', 'securityRequirements', 'Requirements need declared schemes.')
    } else {
      findings.add('warning', 'missing_security', 'securitySchemes', 'No authentication scheme is advertised.')
    }
    return { authenticated: false, allowsAnonymous: true, schemes: [], requirementCount: 0 }
  }
  if (!isRecord(card.securitySchemes)) {
    findings.add('error', 'invalid_security_schemes', 'securitySchemes', 'securitySchemes must be an object.')
    return { authenticated: false, allowsAnonymous: true, schemes: [], requirementCount: 0 }
  }
  const schemesRecord = card.securitySchemes
  const names = Object.keys(schemesRecord)
  if (names.length > LIMITS.schemes) {
    findings.add('error', 'too_many_security_schemes', 'securitySchemes', 'Too many security schemes are advertised.')
  }
  const bounded = names.slice(0, LIMITS.schemes)
  bounded.forEach((name) => inspectScheme(schemesRecord[name], `securitySchemes.${name}`, findings))
  const requirements = inspectRequirements(card.securityRequirements, 'securityRequirements', new Set(bounded), findings)
  if (bounded.length > 0 && requirements.count === 0) {
    findings.add('warning', 'missing_security_requirement', 'securityRequirements', 'Schemes are declared but not required.')
  }
  return {
    authenticated: requirements.hasAuthenticated && !requirements.allowsAnonymous,
    allowsAnonymous: requirements.allowsAnonymous,
    schemes: bounded,
    requirementCount: requirements.count,
  }
}

function inspectSkills(
  value: unknown,
  defaultInputModes: string[],
  defaultOutputModes: string[],
  schemes: Set<string>,
  findings: Findings,
): { skillCount: number; compatibleSkillCount: number } {
  if (!Array.isArray(value)) {
    findings.add('error', 'required_skills', 'skills', 'skills must be an array.')
    return { skillCount: 0, compatibleSkillCount: 0 }
  }
  if (value.length === 0) findings.add('error', 'empty_skills', 'skills', 'At least one skill is required.')
  if (value.length > LIMITS.skills) findings.add('error', 'too_many_skills', 'skills', 'Too many skills are advertised.')

  let compatibleSkillCount = 0
  const ids = new Set<string>()
  value.slice(0, LIMITS.skills).forEach((skill, index) => {
    const path = `skills[${index}]`
    if (!isRecord(skill)) {
      findings.add('error', 'invalid_skill', path, 'Skill must be an object.')
      return
    }
    const id = stringValue(skill, 'id', `${path}.id`, findings, true, 128)
    stringValue(skill, 'name', `${path}.name`, findings, true, 160)
    stringValue(skill, 'description', `${path}.description`, findings)
    stringList(skill.tags, `${path}.tags`, findings, 32, true)
    stringList(skill.examples, `${path}.examples`, findings, 16)
    if (id && ids.has(id)) findings.add('error', 'duplicate_skill_id', `${path}.id`, `Duplicate skill id: ${id}.`)
    if (id) ids.add(id)

    const inputModes = has(skill, 'inputModes')
      ? stringList(skill.inputModes, `${path}.inputModes`, findings, LIMITS.modes)
      : defaultInputModes
    const outputModes = has(skill, 'outputModes')
      ? stringList(skill.outputModes, `${path}.outputModes`, findings, LIMITS.modes)
      : defaultOutputModes
    inspectRequirements(skill.securityRequirements, `${path}.securityRequirements`, schemes, findings)
    if (hasTextMode(inputModes) && hasTextMode(outputModes)) compatibleSkillCount += 1
    else findings.add('warning', 'skill_not_text_compatible', path, 'Skill is not text compatible with Nexez.')
  })
  if (value.length > 0 && compatibleSkillCount === 0) {
    findings.add('warning', 'no_compatible_skill', 'skills', 'No text-compatible skill is advertised.')
  }
  return { skillCount: Math.min(value.length, LIMITS.skills), compatibleSkillCount }
}

function inspectSignatures(value: unknown, findings: Findings): number {
  if (value === undefined || value === null) return 0
  if (!Array.isArray(value)) {
    findings.add('error', 'invalid_signatures', 'signatures', 'signatures must be an array.')
    return 0
  }
  if (value.length > LIMITS.signatures) findings.add('error', 'too_many_signatures', 'signatures', 'Too many signatures are present.')
  value.slice(0, LIMITS.signatures).forEach((signature, index) => {
    const path = `signatures[${index}]`
    if (!isRecord(signature)) {
      findings.add('error', 'invalid_signature', path, 'Signature must be an object.')
      return
    }
    for (const field of ['protected', 'signature'] as const) {
      const encoded = stringValue(signature, field, `${path}.${field}`, findings, true, 16_384)
      if (encoded && !/^[A-Za-z0-9_-]+$/.test(encoded)) {
        findings.add('error', 'invalid_jws_encoding', `${path}.${field}`, `${field} must be base64url encoded.`)
      }
    }
    if (has(signature, 'header') && !isRecord(signature.header)) {
      findings.add('error', 'invalid_signature_header', `${path}.header`, 'header must be an object.')
    }
  })
  if (value.length > 0) findings.add('warning', 'signature_not_verified', 'signatures', 'Signature syntax was inspected, not cryptographically verified.')
  return Math.min(value.length, LIMITS.signatures)
}

export function inspectA2AAgentCard(value: unknown): A2AAgentCardConformance {
  const findings = new Findings()
  const empty = (): A2AAgentCardConformance => ({
    profile: `a2a-${A2A_AGENT_CARD_PROFILE}`,
    specRelease: A2A_AGENT_CARD_SPEC_RELEASE,
    valid: false,
    compatible: false,
    preferredInterface: null,
    selectedInterface: null,
    interfaces: [],
    protocolVersions: [],
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false, requiredExtensions: [] },
    inputModes: [],
    outputModes: [],
    security: { authenticated: false, allowsAnonymous: true, schemes: [], requirementCount: 0 },
    skillCount: 0,
    compatibleSkillCount: 0,
    signatures: { count: 0, verified: false },
    issues: findings.issues,
  })
  if (!isRecord(value)) {
    findings.add('error', 'invalid_card', '$', 'Agent Card must be a JSON object.')
    return empty()
  }

  for (const field of LEGACY_FIELDS) {
    if (has(value, field)) findings.add('error', 'legacy_field', field, `${field} belongs to the retired A2A 0.3 card shape.`)
  }
  stringValue(value, 'name', 'name', findings, true, 160)
  stringValue(value, 'description', 'description', findings)
  stringValue(value, 'version', 'version', findings, true, 64)

  if (value.provider !== undefined) {
    if (!isRecord(value.provider)) findings.add('error', 'invalid_provider', 'provider', 'provider must be an object.')
    else {
      stringValue(value.provider, 'organization', 'provider.organization', findings, true, 160)
      safeHttpUrl(stringValue(value.provider, 'url', 'provider.url', findings), 'provider.url', findings)
    }
  }
  for (const field of ['documentationUrl', 'iconUrl'] as const) {
    const candidate = stringValue(value, field, field, findings, false)
    if (candidate) safeHttpUrl(candidate, field, findings)
  }

  const interfaces = inspectInterfaces(value.supportedInterfaces, findings)
  const preferredInterface = interfaces[0] ?? null
  const selectedInterface = interfaces.find((entry) => entry.compatible) ?? null
  const capabilities = inspectCapabilities(value.capabilities, findings)
  const inputModes = stringList(value.defaultInputModes, 'defaultInputModes', findings, LIMITS.modes, true)
  const outputModes = stringList(value.defaultOutputModes, 'defaultOutputModes', findings, LIMITS.modes, true)
  if (!hasTextMode(inputModes)) findings.add('warning', 'text_input_not_supported', 'defaultInputModes', 'Nexez requires text input.')
  if (!hasTextMode(outputModes)) findings.add('warning', 'text_output_not_supported', 'defaultOutputModes', 'Nexez requires text output.')
  const security = inspectSecurity(value, findings)
  if (capabilities.extendedAgentCard && security.allowsAnonymous) {
    findings.add('warning', 'extended_card_without_required_auth', 'capabilities.extendedAgentCard', 'Extended cards should require authentication.')
  }
  const skills = inspectSkills(value.skills, inputModes, outputModes, new Set(security.schemes), findings)
  const signatureCount = inspectSignatures(value.signatures, findings)
  const valid = !findings.hasError
  const compatible = valid
    && Boolean(selectedInterface)
    && skills.compatibleSkillCount > 0
    && capabilities.requiredExtensions.length === 0

  return {
    profile: `a2a-${A2A_AGENT_CARD_PROFILE}`,
    specRelease: A2A_AGENT_CARD_SPEC_RELEASE,
    valid,
    compatible,
    preferredInterface,
    selectedInterface,
    interfaces,
    protocolVersions: [...new Set(interfaces.map((entry) => entry.protocolVersion))],
    capabilities,
    inputModes,
    outputModes,
    security,
    ...skills,
    signatures: { count: signatureCount, verified: false },
    issues: findings.issues,
  }
}
