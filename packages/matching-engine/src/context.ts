import { containsPhrase, normalizeLabel, type AnswerContext, type FieldDescriptor } from '@ufa/core'

export interface ContextEnvironment {
  site: string
  pageTitle: string | null
  applicationType: string | null
}

export interface ContextFit {
  /** False when the answer's rules exclude this field. */
  applies: boolean
  /** Rules that matched; more matched rules make the answer more specific. */
  matched: string[]
  reason: string | null
}

export function siteMatches(site: string, rule: string): boolean {
  const host = site.toLowerCase()
  const wanted = rule.toLowerCase()
  return host === wanted || host.endsWith(`.${wanted}`)
}

function firstContained(text: string, keywords: readonly string[]): string | null {
  for (const keyword of keywords) {
    const normalized = normalizeLabel(keyword)
    if (normalized && containsPhrase(text, normalized)) return normalized
  }
  return null
}

/** Whether an answer's context rules allow it for this field, and which rules matched. */
export function evaluateContext(
  context: AnswerContext,
  field: FieldDescriptor,
  environment: ContextEnvironment,
): ContextFit {
  const matched: string[] = []
  const excluded = (reason: string): ContextFit => ({ applies: false, matched, reason })

  if (context.sites.length) {
    const site = context.sites.find((rule) => siteMatches(environment.site, rule))
    if (!site) return excluded(`Only for ${context.sites.join(', ')}`)
    matched.push(`site ${site}`)
  }
  if (context.sectionKeywords.length) {
    const keyword = firstContained(normalizeLabel(field.section), context.sectionKeywords)
    if (!keyword) return excluded(`Only in sections about ${context.sectionKeywords.join(', ')}`)
    matched.push(`section mentions "${keyword}"`)
  }
  if (context.formKeywords.length) {
    const titles =
      `${normalizeLabel(field.formTitle)} ${normalizeLabel(environment.pageTitle)}`.trim()
    const keyword = firstContained(titles, context.formKeywords)
    if (!keyword) return excluded(`Only on forms about ${context.formKeywords.join(', ')}`)
    matched.push(`form mentions "${keyword}"`)
  }
  if (context.applicationTypes.length) {
    const type = environment.applicationType?.toLowerCase()
    const hit = type
      ? context.applicationTypes.find((candidate) => candidate.toLowerCase() === type)
      : undefined
    if (!hit) return excluded(`Only for ${context.applicationTypes.join(', ')} forms`)
    matched.push(`${hit} form`)
  }
  return {
    applies: true,
    matched,
    reason: matched.length ? `Context: ${matched.join(', ')}` : null,
  }
}
