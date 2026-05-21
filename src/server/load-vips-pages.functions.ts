import { createServerFn } from '@tanstack/react-start'
import { loadVipsPagesInputSchema } from './function-schemas'

/**
 * U9 — fetch the four VIPS pages + non-forgotten timeline entries for the
 * `/wiki` overview and `/library/$dimension` per-dimension pages. The
 * response shape is deliberately narrow: it does NOT include
 * `vips_forget_count` (R20 — recorded server-side, never surfaced).
 */
export const loadVipsPages = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadVipsPagesInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { loadVipsPagesHandler } = await import('./load-vips-pages.handler.server')
    return loadVipsPagesHandler(data)
  })
