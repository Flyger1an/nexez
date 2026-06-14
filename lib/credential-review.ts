import { llmComplete, llmVisionCompleteDetailed } from './llm'

// LLM credential review. Looks at an uploaded document (image via vision, PDF
// via text extraction) and judges whether it's a genuine, relevant, unexpired
// professional credential for the business. This is LLM-REVIEWED plausibility,
// NOT authority-grade authentication — we never contact an issuing body.
//
// Fail-safe by construction: anything other than a confident, legitimate,
// unexpired, matching credential returns 'pending' or 'rejected'. Only a clear
// pass returns 'verified' (the one status that boosts the trust score), so a
// missing key, model error, scanned/blank file, or unparseable result can never
// inflate trust.

export type CredentialVerdict = {
  type?: string
  issuer?: string
  holder?: string
  expiry?: string
  expired?: boolean
  holder_matches_business?: boolean
  legitimate?: boolean
  confidence?: number
  reason?: string
}

export type CredentialReview = { status: 'verified' | 'rejected' | 'pending'; verdict: CredentialVerdict }

export type ReviewBusiness = { name?: string | null; industry?: string | null; location?: string | null }

const SYSTEM =
  'You are a skeptical credential reviewer for a business directory. You inspect an uploaded document and judge whether it is a genuine, relevant professional credential (license, certification, registration, permit, certificate of insurance) for the stated business. Blank pages, screenshots of unrelated content, random or placeholder files, obviously fabricated or AI-generated documents, and expired credentials must NOT pass. You cannot contact issuing authorities, so judge only what is visible and never claim authority-level authentication. Respond with ONLY a JSON object and no other text.'

function buildPrompt(business: ReviewBusiness): string {
  return `Business on file:
- Name: ${business.name || 'unknown'}
- Industry: ${business.industry || 'unknown'}
- Location: ${business.location || 'unknown'}

Review the attached credential document and return ONLY this JSON object:
{
  "legitimate": boolean,               // is this a real, relevant professional credential document (not blank/random/unrelated/fabricated)?
  "type": string,                      // e.g. "Plumbing license", "Certificate of insurance" ("" if unclear)
  "issuer": string,                    // issuing authority/org ("" if unclear)
  "holder": string,                    // person/business named on the document ("" if unclear)
  "expiry": string,                    // expiry date as shown ("" if none)
  "expired": boolean,                  // true only if an expiry date is present and clearly in the past
  "holder_matches_business": boolean,  // does the holder/org plausibly match the business name above?
  "confidence": number,                // 0..1 confidence in this judgment
  "reason": string                     // one short sentence explaining the verdict
}`
}

function parseVerdict(text: string): CredentialVerdict | null {
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    return parsed && typeof parsed === 'object' ? (parsed as CredentialVerdict) : null
  } catch {
    return null
  }
}

function decide(v: CredentialVerdict): CredentialReview['status'] {
  if (v.legitimate === false) return 'rejected'
  if (
    v.legitimate === true &&
    (v.confidence ?? 0) >= 0.6 &&
    v.expired !== true &&
    v.holder_matches_business !== false
  ) {
    return 'verified'
  }
  return 'pending'
}

export async function reviewCredential(input: {
  name: string
  mime: string
  bytes: Uint8Array
  business: ReviewBusiness
}): Promise<CredentialReview> {
  const prompt = buildPrompt(input.business)
  let text: string | null = null

  try {
    if (input.mime.startsWith('image/')) {
      const dataUrl = `data:${input.mime};base64,${Buffer.from(input.bytes).toString('base64')}`
      const res = await llmVisionCompleteDetailed(prompt, [dataUrl], { system: SYSTEM, maxTokens: 500, temperature: 0.1 })
      text = res.text
    } else if (input.mime === 'application/pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(new Uint8Array(input.bytes))
      const { text: docText } = await extractText(pdf, { mergePages: true })
      const raw: unknown = docText
      const clean = (typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('\n') : '').trim()
      if (!clean) {
        return { status: 'pending', verdict: { reason: 'No readable text in the PDF (likely a scanned image) — left for manual review.' } }
      }
      text = await llmComplete(`${prompt}\n\nDOCUMENT TEXT:\n${clean.slice(0, 12000)}`, { system: SYSTEM, maxTokens: 500, temperature: 0.1 })
    } else {
      return { status: 'pending', verdict: { reason: 'Unsupported file type for automated review.' } }
    }
  } catch {
    return { status: 'pending', verdict: { reason: 'Automated review could not run — left as pending (no score boost).' } }
  }

  if (!text) {
    return { status: 'pending', verdict: { reason: 'Review service unavailable — left as pending (no score boost).' } }
  }
  const verdict = parseVerdict(text)
  if (!verdict) {
    return { status: 'pending', verdict: { reason: 'Could not parse the review result — left as pending.' } }
  }
  return { status: decide(verdict), verdict }
}
