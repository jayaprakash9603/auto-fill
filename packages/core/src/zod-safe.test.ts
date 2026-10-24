import { z } from 'zod'

import { ensureExtensionSafeZod } from './zod-safe'

describe('extension-safe zod', () => {
  it('parses without eval, so a strict extension page can load', () => {
    ensureExtensionSafeZod()
    const original = globalThis.Function
    globalThis.Function = function Blocked() {
      throw new Error('eval blocked')
    } as unknown as typeof Function
    try {
      const parsed = z.object({ name: z.string() }).safeParse({ name: 'Ada' })
      expect(parsed).toMatchObject({ success: true, data: { name: 'Ada' } })
    } finally {
      globalThis.Function = original
    }
  })
})
