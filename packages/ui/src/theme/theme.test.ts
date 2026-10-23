import { afterEach, describe, expect, it } from 'vitest'

import { cssVariableTheme, createTheme, isSafeTokenValue, themeToStyle } from './theme'
import { detectHostScheme } from './use-color-scheme'

describe('theme tokens', () => {
  it('maps tokens to --ufa-* variables, scheme overrides last', () => {
    const theme = createTheme({
      tokens: { primary: '#111111', radius: '4px' },
      dark: { primary: '#eeeeee' },
    })
    expect(themeToStyle(theme, 'light')).toEqual({
      '--ufa-primary': '#111111',
      '--ufa-radius': '4px',
    })
    expect(themeToStyle(theme, 'dark')).toEqual({
      '--ufa-primary': '#eeeeee',
      '--ufa-radius': '4px',
    })
  })

  it('drops values that could escape a declaration and unknown token names', () => {
    expect(isSafeTokenValue('url(https://evil.test/x.png)')).toBe(false)
    expect(isSafeTokenValue('red; background: red')).toBe(false)
    expect(isSafeTokenValue('}</style>')).toBe(false)
    expect(isSafeTokenValue('oklch(0.6 0.2 250)')).toBe(true)
    const theme = createTheme({ tokens: { primary: 'red;}', foreground: '#000' } as never })
    const withUnknown = createTheme({ tokens: { nope: '#fff' } as never })
    expect(themeToStyle(theme, 'light')).toEqual({ '--ufa-foreground': '#000' })
    expect(themeToStyle(withUnknown, 'light')).toEqual({})
  })

  it('cssVariableTheme adopts host shadcn variables with built-in fallbacks', () => {
    const theme = cssVariableTheme()
    expect(theme.colorScheme).toBe('inherit')
    const style = themeToStyle(theme, 'light') as Record<string, string>
    expect(style['--ufa-primary']).toBe('var(--primary, var(--ufa-d-primary))')
    expect(style['--ufa-radius']).toBe('var(--radius, var(--ufa-d-radius))')
    expect(style['--ufa-font-family']).toBe('inherit')
    const custom = themeToStyle(
      cssVariableTheme({ mapping: { primary: '--brand' }, inheritFont: false }),
      'light',
    ) as Record<string, string>
    expect(custom['--ufa-primary']).toBe('var(--brand, var(--ufa-d-primary))')
    expect(custom['--ufa-font-family']).toBeUndefined()
  })

  it('ignores invalid host variable names', () => {
    const style = themeToStyle(
      cssVariableTheme({ mapping: { primary: 'primary); color: red' } }),
      'light',
    ) as Record<string, string>
    expect(style['--ufa-primary']).toBeUndefined()
  })
})

describe('detectHostScheme', () => {
  afterEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
  })

  it('reads the dark class and data-theme', () => {
    expect(detectHostScheme()).toBeNull()
    document.documentElement.classList.add('dark')
    expect(detectHostScheme()).toBe('dark')
    document.documentElement.classList.remove('dark')
    document.documentElement.setAttribute('data-theme', 'light')
    expect(detectHostScheme()).toBe('light')
  })
})
