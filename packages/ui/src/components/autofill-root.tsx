import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import { cn } from '../lib/cn'
import { PortalContainerContext } from '../lib/portal'
import {
  createTheme,
  themeToStyle,
  type AutofillTheme,
  type ResolvedColorScheme,
} from '../theme/theme'
import { useResolvedColorScheme } from '../theme/use-color-scheme'

export interface AutofillRootProps {
  theme?: AutofillTheme
  className?: string
  style?: CSSProperties
  children: ReactNode
  /** Where overlays mount. Defaults to `document.body`; pass a shadow root's element for full isolation. */
  portalTarget?: HTMLElement | null
}

function applyRootAttributes(
  element: HTMLElement,
  scheme: ResolvedColorScheme,
  density: string,
  style: CSSProperties,
): void {
  element.classList.add('ufa-root')
  element.dataset.ufaScheme = scheme
  element.dataset.ufaDensity = density
  for (let index = element.style.length - 1; index >= 0; index -= 1) {
    const property = element.style.item(index)
    if (property.startsWith('--ufa-')) element.style.removeProperty(property)
  }
  for (const [property, value] of Object.entries(style))
    element.style.setProperty(property, String(value))
}

/**
 * Scopes every autofill style to its subtree and to one body-level overlay container, so the
 * host's own CSS and markup are left untouched.
 */
export function AutofillRoot({
  theme,
  className,
  style,
  children,
  portalTarget,
}: AutofillRootProps) {
  const resolvedTheme = useMemo(() => createTheme(theme), [theme])
  const scheme = useResolvedColorScheme(resolvedTheme.colorScheme)
  const density = resolvedTheme.density ?? 'comfortable'
  const tokenStyle = useMemo(() => themeToStyle(resolvedTheme, scheme), [resolvedTheme, scheme])
  // Created detached during render (no side effects) and attached only while mounted.
  const [portalContainer] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined') return null
    const container = document.createElement('div')
    container.dataset.ufaPortal = ''
    return container
  })

  useLayoutEffect(() => {
    const target = portalTarget ?? portalContainer?.ownerDocument.body
    if (!portalContainer || !target) return
    target.appendChild(portalContainer)
    return () => portalContainer.remove()
  }, [portalContainer, portalTarget])

  useLayoutEffect(() => {
    if (portalContainer) applyRootAttributes(portalContainer, scheme, density, tokenStyle)
  }, [portalContainer, scheme, density, tokenStyle])

  return (
    <PortalContainerContext.Provider value={portalContainer}>
      <TooltipPrimitive.Provider delayDuration={300}>
        <div
          className={cn('ufa-root', 'ufa:bg-background ufa:text-foreground', className)}
          data-ufa-scheme={scheme}
          data-ufa-density={density}
          style={{ ...tokenStyle, ...style }}
        >
          {children}
        </div>
      </TooltipPrimitive.Provider>
    </PortalContainerContext.Provider>
  )
}
