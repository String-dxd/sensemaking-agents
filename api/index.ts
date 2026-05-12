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
  // Vercel's Node runtime hands the function a Request whose `.url` is the
  // path only (e.g. `/`), but TanStack Start's H3-derived handler expects
  // an absolute URL. Reconstruct one from `host` / `x-forwarded-*` headers.
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (host !== null && !/^https?:\/\//i.test(request.url)) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    const absolute = `${proto}://${host}${request.url}`
    const body =
      request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer()
    request = new Request(absolute, {
      method: request.method,
      headers: request.headers,
      ...(body !== undefined ? { body } : {}),
      redirect: 'manual',
    })
  }
  // biome-ignore lint/suspicious/noExplicitAny: third-party fetch handler shape
  return (server as any).fetch(request)
}

export const config = {
  runtime: 'nodejs',
}
