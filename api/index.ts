import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleNodeRequest } from './request-adapter'

// Vercel serverless function adapter for TanStack Start.
//
// The Vite build emits `dist/server/server.js` with a `default` export
// whose `.fetch(request: Request): Promise<Response>` is the Web Fetch
// handler that drives the TanStack Start router. Vercel's Node runtime
// invokes this file with `(req: IncomingMessage, res: ServerResponse)`,
// so this adapter converts between the two.
//
// Paired with `vercel.json`, which:
//   - Serves `dist/client/` as the static asset directory.
//   - Rewrites unmatched URLs to `/api/index` so SSR runs server-side.
//   - Bundles `dist/server/**` with this function via `includeFiles`.
//
// @ts-expect-error — `dist/server/server.js` is built by `pnpm build`; the
// import is resolved at function-build time by Vercel's esbuild step.
import server from '../dist/server/server.js'

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: third-party fetch handler shape
  await handleNodeRequest(req, res, (request) => (server as any).fetch(request))
}

export const config = {
  runtime: 'nodejs',
}
