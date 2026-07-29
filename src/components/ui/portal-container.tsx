import { createContext, type PropsWithChildren, type RefObject, useContext } from 'react'

export type PortalContainer =
  | HTMLElement
  | ShadowRoot
  | null
  | RefObject<HTMLElement | ShadowRoot | null>

const PortalContainerContext = createContext<PortalContainer | undefined>(undefined)

export interface PortalContainerProviderProps extends PropsWithChildren {
  container: PortalContainer
}

export function PortalContainerProvider({ container, children }: PortalContainerProviderProps) {
  return (
    <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>
  )
}

export function usePortalContainer() {
  return useContext(PortalContainerContext)
}
