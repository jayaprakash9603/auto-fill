import {
  fieldValuesEqual,
  isFieldValueEmpty,
  mostRestrictive,
  POLICY_RESTRICTIVENESS,
  type FormActionPolicy,
  type PolicyDecision,
  type PolicyInput,
} from '@ufa/core'

export const SAFETY_POLICY_ID = 'ufa.safety'

/** True when `site` is one of `sites` or a subdomain of one. */
export function isTrustedSite(site: string, sites: readonly string[]): boolean {
  const host = site.toLowerCase()
  return sites.some((entry) => {
    const trusted = entry.trim().toLowerCase().replace(/^\*\./, '')
    return trusted !== '' && (host === trusted || host.endsWith(`.${trusted}`))
  })
}

const decide = (action: PolicyDecision['action'], reason: string): PolicyDecision => ({
  action,
  reason,
})

/**
 * The built-in rules. Protected, unsupported, hidden and read-only fields are blocked; fields
 * without a usable answer are skipped; consent fields always need the user's own selection;
 * existing values are kept unless overwriting is enabled; and only trusted mode on a trusted
 * site may fill a high-confidence saved answer without per-field selection.
 */
export function safetyPolicy(input: PolicyInput): PolicyDecision {
  const { field, match, generated, settings, site } = input
  if (field.sensitivity === 'prohibited')
    return decide('block', `Protected field (${field.sensitivityReason ?? 'sensitive'}): never filled.`)
  if (field.support === 'unsupported')
    return decide('block', field.unsupportedReason ?? 'This control is not supported.')
  if (field.type === 'file') return decide('block', 'Files are never uploaded automatically.')
  if (!field.editable) return decide('block', 'The field cannot be edited.')
  if (!field.visible) return decide('skip', 'The field is hidden.')

  const value = generated ? generated.value : (match.best?.fillValue ?? null)
  if (generated) {
    if (field.sensitivity === 'consent')
      return decide('block', 'Consent fields never receive generated values.')
    if (!generated.valid)
      return decide('skip', generated.validationMessage ?? 'The generated value is not valid here.')
  } else {
    switch (match.state) {
      case 'matched':
      case 'suggested':
        break
      case 'ambiguous':
        return decide('suggest', match.reason ?? 'Several saved answers fit. Choose one.')
      case 'skipped':
      case 'unsupported':
        return decide('block', match.reason ?? 'This field is never filled.')
      default:
        return decide('skip', match.reason ?? 'No saved answer fits.')
    }
  }
  if (!value) return decide('skip', 'The answer cannot be expressed in this field.')

  if (field.hasValue) {
    if (fieldValuesEqual(field.currentValue, value))
      return decide('skip', 'Already filled with this answer.')
    if (!settings.overwriteExisting)
      return decide('skip', 'Already has a value; it is kept.')
  }
  if (settings.mode === 'suggest')
    return decide('suggest', 'Suggest mode shows answers without changing the page.')
  if (field.sensitivity === 'consent')
    return decide('confirm', 'Consent: changed only when you select this field yourself.')
  if (generated) return decide('confirm', 'Generated value: fill it only if you select it.')

  const best = match.best
  const trustedFill =
    settings.mode === 'trusted' &&
    match.state === 'matched' &&
    !!best &&
    best.confidence.score >= settings.trusted.minConfidence &&
    !field.hasValue &&
    !isFieldValueEmpty(value) &&
    isTrustedSite(site, settings.trusted.sites)
  if (trustedFill) return decide('fill', 'Trusted site and a high-confidence saved answer.')
  if (match.state === 'matched') return decide('confirm', 'Ready to fill when you select it.')
  return decide('confirm', 'Check this answer before you select it.')
}

export interface PolicyEvaluationOptions {
  /** Registered policies; they run after the built-in rules and can only tighten them. */
  policies?: readonly FormActionPolicy[]
  onPluginError?: (pluginId: string, error: unknown) => void
}

function isDecision(value: unknown): value is PolicyDecision {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<PolicyDecision>
  return (
    typeof candidate.action === 'string' &&
    Object.hasOwn(POLICY_RESTRICTIVENESS, candidate.action) &&
    typeof candidate.reason === 'string'
  )
}

/**
 * Decides what may happen to one field. The most restrictive decision wins; a policy that throws
 * or returns something malformed blocks the field rather than being ignored.
 */
export function evaluatePolicies(
  input: PolicyInput,
  options: PolicyEvaluationOptions = {},
): PolicyDecision {
  let decision = safetyPolicy(input)
  for (const policy of options.policies ?? []) {
    let extra: PolicyDecision | null
    try {
      const returned = policy.evaluate(input)
      if (returned !== null && !isDecision(returned))
        throw new Error('The policy returned a malformed decision.')
      extra = returned === null ? null : { action: returned.action, reason: returned.reason.slice(0, 300) }
    } catch (error) {
      options.onPluginError?.(policy.id, error)
      extra = decide('block', 'A policy plugin failed, so this field is left alone.')
    }
    decision = mostRestrictive(decision, extra)
  }
  return decision
}
