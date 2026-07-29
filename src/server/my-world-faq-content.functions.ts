import { createServerFn } from '@tanstack/react-start'
import type { MyWorldFaqContent } from '~/data/my-world-faq'

/**
 * Public-only loader boundary. The browser-visible module has no static
 * database, Runtime Cache or editor imports; those stay behind this dynamic
 * server handler.
 */
export const loadMyWorldFaqContent = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MyWorldFaqContent> => {
    const { loadMyWorldFaqContentHandler } = await import('./my-world-faq-content.handler.server')
    return loadMyWorldFaqContentHandler()
  },
)
