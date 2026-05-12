// Vercel serverless function adapter for TanStack Start.
//
// The Vite build emits `dist/server/server.js` with a `default` export that
// has a Web-Fetch `fetch(request)` handler. Vercel functions support that
// signature natively when exported as `default`. This file wires the two
// together so Vercel routes every request through the TanStack Start router.
//
// Paired with `vercel.json`, which:
//   - Serves `dist/client/` as the static asset directory.
//   - Rewrites unmatched URLs to `/api/index` so SSR runs server-side.
//   - Bundles `dist/server/**` with this function via `includeFiles`.
//
// @ts-expect-error — `dist/server/server.js` is built by `pnpm build`; the
// import is resolved at function-build time by Vercel's esbuild step.
import server from '../dist/server/server.js'

export default async function handler(request: Request): Promise<Response> {
  // biome-ignore lint/suspicious/noExplicitAny: third-party fetch handler shape
  return (server as any).fetch(request)
}

export const config = {
  runtime: 'nodejs',
}
