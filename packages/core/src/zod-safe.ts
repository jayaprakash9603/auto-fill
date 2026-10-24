import { z } from 'zod'

let applied = false

/**
 * Turns off Zod's code generator. Extension pages and content scripts cannot use `new Function`
 * (the default CSP rejects it), and the failed compile blocks the panel before any form is shown.
 * Call this before the first parse in each process.
 */
export function ensureExtensionSafeZod(): void {
  if (applied) return
  applied = true
  z.config({ jitless: true })
}
