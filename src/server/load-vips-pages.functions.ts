import { createServerFn } from '@tanstack/react-start'
import { loadVipsPagesHandler, loadVipsPagesInputSchema } from './load-vips-pages.handler.server'

/**
 * U9 — fetch the four VIPS pages + non-forgotten timeline entries for the
 * `/wiki` overview and `/library/$dimension` per-dimension pages. The
 * response shape is deliberately narrow: it does NOT include
 * `vips_forget_count` (R20 — recorded server-side, never surfaced).
 */
export const loadVipsPages = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadVipsPagesInputSchema.parse(raw))
  .handler(({ data }) => loadVipsPagesHandler(data))
