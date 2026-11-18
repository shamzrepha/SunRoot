import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

interface MountedIsland {
  root: Root
  unmount: () => void
}

const mountedIslands = new Map<HTMLElement, MountedIsland>()

export function mountReactIsland(container: HTMLElement, element: ReactElement): () => void {
  const existing = mountedIslands.get(container)
  if (existing) {
    existing.root.render(element)
    return existing.unmount
  }

  const root = createRoot(container)
  let active = true
  const unmount = () => {
    if (!active) return
    active = false
    mountedIslands.delete(container)
    root.unmount()
  }

  mountedIslands.set(container, { root, unmount })
  root.render(element)
  return unmount
}

export function unmountActiveScreenIsland(): void {
  for (const [container, entry] of [...mountedIslands.entries()]) {
    if (
      !container.isConnected ||
      container.id === 'view' ||
      Boolean(container.closest('#view')) ||
      Boolean(container.closest('.login-screen'))
    ) {
      entry.unmount()
    }
  }
}
