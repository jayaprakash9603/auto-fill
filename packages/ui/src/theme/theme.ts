import type { CSSProperties } from 'react'

export type ColorScheme = 'light' | 'dark' | 'system' | 'inherit'
export type ResolvedColorScheme = 'light' | 'dark'
export type Density = 'comfortable' | 'compact'

export interface ThemeTokens {
  background: string
  foreground: string
  card: string
  cardForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  muted: string
  mutedForeground: string
  accent: string
  accentForeground: string
  destructive: string
  destructiveForeground: string
  success: string
  warning: string
  info: string
  border: string
  input: string
  /** Focus ring color. */
  ring: string
  radius: string
  fontFamily: string
  fontSize: string
  /** Base spacing step; every padding, gap and size scales with it. */
  spacingUnit: string
}

export interface AutofillTheme {
  /** `inherit` follows the host page (dark class / color-scheme); `system` follows the OS. */
  colorScheme?: ColorScheme
  density?: Density
  /** Applied in both schemes. */
  tokens?: Partial<ThemeTokens>
  /** Applied only in light mode, after `tokens`. */
  light?: Partial<ThemeTokens>
  /** Applied only in dark mode, after `tokens`. */
  dark?: Partial<ThemeTokens>
}

const TOKEN_VARIABLES: Record<keyof ThemeTokens, string> = {
  background: '--ufa-background',
  foreground: '--ufa-foreground',
  card: '--ufa-card',
  cardForeground: '--ufa-card-foreground',
  popover: '--ufa-popover',
  popoverForeground: '--ufa-popover-foreground',
  primary: '--ufa-primary',
  primaryForeground: '--ufa-primary-foreground',
  secondary: '--ufa-secondary',
  secondaryForeground: '--ufa-secondary-foreground',
  muted: '--ufa-muted',
  mutedForeground: '--ufa-muted-foreground',
  accent: '--ufa-accent',
  accentForeground: '--ufa-accent-foreground',
  destructive: '--ufa-destructive',
  destructiveForeground: '--ufa-destructive-foreground',
  success: '--ufa-success',
  warning: '--ufa-warning',
  info: '--ufa-info',
  border: '--ufa-border',
  input: '--ufa-input',
  ring: '--ufa-ring',
  radius: '--ufa-radius',
  fontFamily: '--ufa-font-family',
  fontSize: '--ufa-font-size',
  spacingUnit: '--ufa-spacing-unit',
}

export const THEME_TOKEN_NAMES = Object.keys(TOKEN_VARIABLES) as (keyof ThemeTokens)[]

const UNSAFE_VALUE = /[;{}<>]|url\s*\(|expression\s*\(|@import|\\/i

/** Token values are host-controlled CSS values; anything that could escape the declaration is dropped. */
export function isSafeTokenValue(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 300 &&
    !UNSAFE_VALUE.test(value)
  )
}

export function createTheme(theme: AutofillTheme = {}): AutofillTheme {
  const clean = (tokens: Partial<ThemeTokens> | undefined) =>
    tokens
      ? (Object.fromEntries(
          Object.entries(tokens).filter(
            ([name, value]) => name in TOKEN_VARIABLES && isSafeTokenValue(value),
          ),
        ) as Partial<ThemeTokens>)
      : undefined
  return {
    colorScheme: theme.colorScheme ?? 'system',
    density: theme.density ?? 'comfortable',
    tokens: clean(theme.tokens),
    light: clean(theme.light),
    dark: clean(theme.dark),
  }
}

/** CSS custom properties for a root element; unset tokens fall back to the stylesheet defaults. */
export function themeToStyle(
  theme: AutofillTheme | undefined,
  scheme: ResolvedColorScheme,
): CSSProperties {
  if (!theme) return {}
  const merged: Partial<ThemeTokens> = {
    ...theme.tokens,
    ...(scheme === 'dark' ? theme.dark : theme.light),
  }
  const style: Record<string, string> = {}
  for (const [name, value] of Object.entries(merged) as [keyof ThemeTokens, string | undefined][]) {
    if (isSafeTokenValue(value)) style[TOKEN_VARIABLES[name]] = value
  }
  return style as CSSProperties
}

/** Neutral built-in theme; the stylesheet already holds these values, so it sets no tokens. */
export const defaultTheme: AutofillTheme = Object.freeze({
  colorScheme: 'system',
  density: 'comfortable',
})

/** Host CSS variable names used by `cssVariableTheme`, keyed by token. Defaults follow shadcn/ui. */
export type CssVariableMapping = Partial<Record<keyof ThemeTokens, string>>

const SHADCN_VARIABLES: CssVariableMapping = {
  background: '--background',
  foreground: '--foreground',
  card: '--card',
  cardForeground: '--card-foreground',
  popover: '--popover',
  popoverForeground: '--popover-foreground',
  primary: '--primary',
  primaryForeground: '--primary-foreground',
  secondary: '--secondary',
  secondaryForeground: '--secondary-foreground',
  muted: '--muted',
  mutedForeground: '--muted-foreground',
  accent: '--accent',
  accentForeground: '--accent-foreground',
  destructive: '--destructive',
  destructiveForeground: '--destructive-foreground',
  border: '--border',
  input: '--input',
  ring: '--ring',
  radius: '--radius',
}

const VARIABLE_NAME = /^--[a-zA-Z0-9_-]{1,100}$/

/**
 * Adopts the host's own CSS variables (shadcn/ui names by default), so the panel follows the host's
 * colors, radius and light/dark switching without duplicating any values. Each variable falls back
 * to the built-in token when the host does not define it.
 */
export function cssVariableTheme(
  options: { mapping?: CssVariableMapping; density?: Density; inheritFont?: boolean } = {},
): AutofillTheme {
  const mapping = { ...SHADCN_VARIABLES, ...options.mapping }
  const tokens: Partial<ThemeTokens> = {}
  for (const [name, variable] of Object.entries(mapping) as [
    keyof ThemeTokens,
    string | undefined,
  ][]) {
    if (!variable || !VARIABLE_NAME.test(variable)) continue
    tokens[name] = `var(${variable}, var(${TOKEN_VARIABLES[name].replace('--ufa-', '--ufa-d-')}))`
  }
  if (options.inheritFont !== false) {
    tokens.fontFamily = 'inherit'
    tokens.fontSize = 'inherit'
  }
  return createTheme({ colorScheme: 'inherit', density: options.density ?? 'comfortable', tokens })
}
