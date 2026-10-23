import { createContext, useContext } from 'react'

/** Element overlays (dialogs, menus, tooltips) render into, so they keep the scoped `.ufa-root` styles. */
export const PortalContainerContext = createContext<HTMLElement | null>(null)

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined
}
