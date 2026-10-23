import type { FieldSensitivity, FieldType } from '../domain/field'
import { humanizeIdentifier } from '../semantics/normalize'

export interface SensitivitySignals {
  type: FieldType
  /** Raw `type` attribute for native inputs (e.g. "password", "hidden"). */
  inputType?: string | null
  autocomplete?: string | null
  label?: string | null
  name?: string | null
  htmlId?: string | null
  placeholder?: string | null
  ariaLabel?: string | null
}

export interface SensitivityVerdict {
  sensitivity: FieldSensitivity
  reason: string | null
}

const PROHIBITED_AUTOCOMPLETE = new Set([
  'current-password',
  'new-password',
  'one-time-code',
  'cc-name',
  'cc-given-name',
  'cc-additional-name',
  'cc-family-name',
  'cc-number',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'cc-csc',
  'cc-type',
  'transaction-amount',
  'username',
  'webauthn',
])

const PROHIBITED_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(pass ?word|passwd|pwd|passcode|pass phrase|passphrase)\b/, 'password'],
  [
    /\b(otp|one time (pass ?code|password|code|pin)|verification code|security code|auth(entication)? code|2fa|mfa|totp|sms code|confirmation code)\b/,
    'one-time code',
  ],
  [/\b(cvv|cvc|csc|cvv2|card verification)\b/, 'card security code'],
  [
    /\b(card number|credit card|debit card|card holder|cardholder|name on card|expiry date|expiration date|exp date|card expiry)\b/,
    'payment card',
  ],
  [
    /\b(iban|swift|bic|routing number|sort code|account number|bank account|upi pin|upi id)\b/,
    'banking',
  ],
  [
    /\b(ssn|social security|social insurance|aadhaar|aadhar|pan number|pan card|passport number|national id|tax id|tin number|driver s? licen[cs]e number)\b/,
    'government identifier',
  ],
  [
    /\b(api key|secret|access token|auth token|bearer|private key|recovery code|seed phrase|mnemonic)\b/,
    'secret or token',
  ],
  [/\b(captcha|recaptcha|hcaptcha|i am not a robot)\b/, 'captcha'],
  [/\b(user ?name|login id|log in id|sign in id)\b/, 'authentication'],
  // A bare PIN is a secret; "PIN code" is an Indian postal code and stays allowed.
  [/\bpin\b(?! ?code)/, 'PIN'],
]

const CONSENT_PATTERNS =
  /\b(i agree|agree|agreement|consent|i accept|accept the|acknowledge|certify|declare|declaration|attest|terms|conditions|privacy policy|privacy notice|i understand|i confirm|confirm that|authori[sz]e|opt in|subscribe|marketing|newsletter|gdpr|background check|signature|e ?sign)\b/

function haystack(signals: SensitivitySignals): string {
  return [
    signals.label,
    signals.ariaLabel,
    signals.placeholder,
    humanizeIdentifier(signals.name),
    humanizeIdentifier(signals.htmlId),
  ]
    .filter(Boolean)
    .join(' | ')
    .toLowerCase()
    .replace(/[^a-z0-9|]+/g, ' ')
}

/**
 * Classifies a control as normal, consent, or prohibited. Prohibited controls are never read,
 * filled, cleared, learned or generated. Consent controls require explicit per-field selection.
 */
export function classifySensitivity(signals: SensitivitySignals): SensitivityVerdict {
  const inputType = signals.inputType?.toLowerCase() ?? null
  if (signals.type === 'password' || inputType === 'password') {
    return { sensitivity: 'prohibited', reason: 'password' }
  }
  if (inputType === 'hidden') return { sensitivity: 'prohibited', reason: 'hidden input' }
  if (signals.type === 'file' || inputType === 'file')
    return { sensitivity: 'prohibited', reason: 'file upload' }

  const autocompleteTokens = (signals.autocomplete ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const blockedToken = autocompleteTokens.find((token) => PROHIBITED_AUTOCOMPLETE.has(token))
  if (blockedToken) return { sensitivity: 'prohibited', reason: `autocomplete=${blockedToken}` }

  const text = haystack(signals)
  for (const [pattern, reason] of PROHIBITED_PATTERNS) {
    if (pattern.test(text)) return { sensitivity: 'prohibited', reason }
  }

  const choiceLike =
    signals.type === 'checkbox' ||
    signals.type === 'checkbox-group' ||
    signals.type === 'radio-group'
  if (choiceLike && CONSENT_PATTERNS.test(text)) {
    return { sensitivity: 'consent', reason: 'consent or declaration' }
  }
  return { sensitivity: 'normal', reason: null }
}

/**
 * Why an answer with these labels may not be stored, or null when it may. Passwords, one-time
 * codes, payment and banking details, government identifiers and secrets are never saved, whether
 * typed in, learned or imported.
 */
export function prohibitedAnswerReason(
  labels: readonly (string | null | undefined)[],
): string | null {
  for (const label of labels) {
    if (!label) continue
    const verdict = classifySensitivity({ type: 'text', label })
    if (verdict.sensitivity === 'prohibited') return verdict.reason
  }
  return null
}
