import { Tooltip as TooltipPrimitive } from 'radix-ui'
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

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
  /** Where overlays mount. Defaults to `document.body`; ignored when `shadowDom` is true. */
  portalTarget?: HTMLElement | null
  /**
   * Mounts the panel inside an open shadow root so host page CSS cannot leak in and autofill
   * utilities cannot leak out. Pass `shadowStyles` (the compiled `style.css` text).
   */
  shadowDom?: boolean
  /** Injected into the shadow root when `shadowDom` is true. */
  shadowStyles?: string
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

interface RootSurfaceProps {
  theme?: AutofillTheme
  className?: string
  style?: CSSProperties
  children: ReactNode
  portalContainer: HTMLElement | null
  portalTarget: HTMLElement | null | undefined
  mountPortalOnTarget: boolean
}

function RootSurface({
  theme,
  className,
  style,
  children,
  portalContainer,
  portalTarget,
  mountPortalOnTarget,
}: RootSurfaceProps) {
  const resolvedTheme = useMemo(() => createTheme(theme), [theme])
  const scheme = useResolvedColorScheme(resolvedTheme.colorScheme)
  const density = resolvedTheme.density ?? 'comfortable'
  const tokenStyle = useMemo(() => themeToStyle(resolvedTheme, scheme), [resolvedTheme, scheme])

  useLayoutEffect(() => {
    if (!mountPortalOnTarget || !portalContainer) return
    const target = portalTarget ?? portalContainer.ownerDocument?.body
    if (!target) return
    if (portalContainer.parentElement !== target) target.appendChild(portalContainer)
    return () => portalContainer.remove()
  }, [portalContainer, portalTarget, mountPortalOnTarget])

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

interface ShadowMount {
  inner: HTMLElement
  portal: HTMLElement
}

/**
 * Scopes every autofill style to its subtree and to one overlay container, so the host's own CSS
 * and markup are left untouched. Optional shadow DOM adds a stronger boundary for embedded hosts.
 */
export function AutofillRoot({
  theme,
  className,
  style,
  children,
  portalTarget,
  shadowDom = false,
  shadowStyles = '',
}: AutofillRootProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [shadowMount, setShadowMount] = useState<ShadowMount | null>(null)
  const [portalContainer] = useState<HTMLElement | null>(() => {
    if (typeof document === 'undefined' || shadowDom) return null
    const container = document.createElement('div')
    container.dataset.ufaPortal = ''
    return container
  })

  useLayoutEffect(() => {
    if (!shadowDom) return
    const host = hostRef.current
    if (!host) return
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    shadow.innerHTML = ''
    const styleElement = document.createElement('style')
    styleElement.textContent = shadowStyles
    shadow.appendChild(styleElement)
    const portal = document.createElement('div')
    portal.dataset.ufaPortal = ''
    shadow.appendChild(portal)
    const inner = document.createElement('div')
    shadow.appendChild(inner)
    setShadowMount({ inner, portal })
    return () => setShadowMount(null)
  }, [shadowDom, shadowStyles])

  if (shadowDom) {
    return (
      <div ref={hostRef} data-ufa-shadow-host className={className}>
        {shadowMount
          ? createPortal(
              <RootSurface
                theme={theme}
                className={undefined}
                style={style}
                portalContainer={shadowMount.portal}
                portalTarget={shadowMount.portal}
                mountPortalOnTarget={false}
              >
                {children}
              </RootSurface>,
              shadowMount.inner,
            )
          : null}
      </div>
    )
  }

  return (
    <RootSurface
      theme={theme}
      className={className}
      style={style}
      portalContainer={portalContainer}
      portalTarget={portalTarget}
      mountPortalOnTarget
    >
      {children}
    </RootSurface>
  )
}
