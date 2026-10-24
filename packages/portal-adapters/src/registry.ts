import type { PortalAdapter, PortalContext } from '@ufa/core'

import { ASHBY_ADAPTER } from './ashby'
import { GENERIC_PORTAL_ADAPTER } from './generic'
import { GREENHOUSE_ADAPTER } from './greenhouse'
import { LEVER_ADAPTER } from './lever'
import { WORKDAY_ADAPTER } from './workday'

/** Built-in adapters sorted by `order` (lower runs first). Generic is always last. */
export const BUILTIN_PORTAL_ADAPTERS: readonly PortalAdapter[] = [
  WORKDAY_ADAPTER,
  GREENHOUSE_ADAPTER,
  LEVER_ADAPTER,
  ASHBY_ADAPTER,
  GENERIC_PORTAL_ADAPTER,
]

export function resolvePortalAdapter(
  context: PortalContext,
  adapters: readonly PortalAdapter[] = BUILTIN_PORTAL_ADAPTERS,
): PortalAdapter {
  const candidates = [...adapters].sort(
    (a, b) => (a.order ?? 1_000) - (b.order ?? 1_000) || a.id.localeCompare(b.id),
  )
  for (const adapter of candidates) {
    if (adapter.id === GENERIC_PORTAL_ADAPTER.id) continue
    if (adapter.canHandle(context)) return adapter
  }
  return GENERIC_PORTAL_ADAPTER
}
