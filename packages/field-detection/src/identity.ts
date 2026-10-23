import { hashString, type FieldType } from '@ufa/core'

export interface FingerprintInput {
  type: FieldType
  tag: string
  inputType: string | null
  name: string | null
  htmlId: string | null
  normalizedLabel: string
  memberCount: number
}

/** Structural identity of a control: what it is and what it asks, never its value. */
export function fingerprintOf(input: FingerprintInput): string {
  return hashString(
    [
      input.type,
      input.tag,
      input.inputType ?? '',
      input.name ?? '',
      input.htmlId ?? '',
      input.normalizedLabel,
      String(input.memberCount),
    ].join('\u0001'),
  )
}

export function randomIdPrefix(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(4))
    return `f${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  }
  return `f${Math.random().toString(16).slice(2, 10)}`
}

interface Entry {
  anchor: WeakRef<Element>
  fingerprint: string
}

/** Detached entries kept so a re-rendered control can reclaim its id. */
const MAX_DETACHED_ENTRIES = 1_000

export interface IdentityRegistry {
  /**
   * Returns the id for a control anchored at `anchor`. The same element keeps its id; a new
   * element with the fingerprint of a detached one (a re-render) takes over the old id.
   */
  assign(anchor: Element, fingerprint: string): string
  /** The connected element currently holding `id`, if any. */
  elementFor(id: string): Element | null
  /** Drops the oldest detached entries beyond the retention limit. */
  prune(): void
}

export function createIdentityRegistry(prefix = randomIdPrefix()): IdentityRegistry {
  const idsByElement = new WeakMap<Element, string>()
  const entries = new Map<string, Entry>()
  const idsByFingerprint = new Map<string, Set<string>>()
  let counter = 0

  const isLive = (entry: Entry) => entry.anchor.deref()?.isConnected === true

  const index = (id: string, fingerprint: string) => {
    const set = idsByFingerprint.get(fingerprint) ?? new Set<string>()
    set.add(id)
    idsByFingerprint.set(fingerprint, set)
  }

  const unindex = (id: string, fingerprint: string) => {
    const set = idsByFingerprint.get(fingerprint)
    set?.delete(id)
    if (set?.size === 0) idsByFingerprint.delete(fingerprint)
  }

  const bind = (id: string, anchor: Element, fingerprint: string) => {
    const previous = entries.get(id)
    if (previous) unindex(id, previous.fingerprint)
    entries.delete(id)
    entries.set(id, { anchor: new WeakRef(anchor), fingerprint })
    index(id, fingerprint)
    idsByElement.set(anchor, id)
    return id
  }

  return {
    assign(anchor, fingerprint) {
      const existing = idsByElement.get(anchor)
      if (existing && entries.has(existing)) return bind(existing, anchor, fingerprint)
      for (const id of idsByFingerprint.get(fingerprint) ?? []) {
        const entry = entries.get(id)
        if (entry && !isLive(entry)) return bind(id, anchor, fingerprint)
      }
      counter += 1
      return bind(`${prefix}-${counter}`, anchor, fingerprint)
    },
    elementFor(id) {
      const element = entries.get(id)?.anchor.deref()
      return element?.isConnected ? element : null
    },
    prune() {
      const detached = [...entries].filter(([, entry]) => !isLive(entry))
      for (const [id, entry] of detached.slice(
        0,
        Math.max(0, detached.length - MAX_DETACHED_ENTRIES),
      )) {
        entries.delete(id)
        unindex(id, entry.fingerprint)
      }
    },
  }
}
