export type IdGenerator = () => string

/** Random id using `crypto.randomUUID` when available. */
export const createId: IdGenerator = () => {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 32-bit FNV-1a hash, rendered in base 36. Used for fingerprints, never for security. */
export function hashString(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

/** Lowercased hostname without a leading `www.`; empty for non-URLs. */
export function siteFromUrl(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** True when `hostname` equals `site` or is a subdomain of it. */
export function hostnameMatchesSite(hostname: string, site: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  const target = site
    .toLowerCase()
    .replace(/^www\./, '')
    .trim()
  if (!target) return false
  return host === target || host.endsWith(`.${target}`)
}
