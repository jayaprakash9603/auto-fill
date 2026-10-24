import type { AutofillTheme } from './theme'

/** Ready-made themes for hosts; pass to `AutofillPanel` / `AutofillRoot`. */
export const THEME_PRESETS = {
  default: {} satisfies AutofillTheme,
  compact: { density: 'compact' } satisfies AutofillTheme,
  highContrast: {
    tokens: {
      border: 'oklch(0.45 0 0)',
      ring: 'oklch(0.55 0.2 250)',
    },
  } satisfies AutofillTheme,
} as const

export type ThemePresetName = keyof typeof THEME_PRESETS
