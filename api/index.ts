import type { IncomingMessage, ServerResponse } from 'node:http'

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
  const host = pickHeader(req.headers['x-forwarded-host']) ?? pickHeader(req.headers.host) ?? 'localhost'
  const proto = pickHeader(req.headers['x-forwarded-proto']) ?? 'https'
  const url = `${proto}://${host}${req.url ?? '/'}`
  const method = req.method ?? 'GET'

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item)
    } else {
      headers.set(key, value)
    }
  }

  let body: ArrayBuffer | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: Array<Buffer> = []
    for await (const chunk of req) {
      chunks.push(chunk as Buffer)
    }
    body = Buffer.concat(chunks).buffer.slice(0) as ArrayBuffer
  }

  const request = new Request(url, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  })

  // biome-ignore lint/suspicious/noExplicitAny: third-party fetch handler shape
  const response: Response = await (server as any).fetch(request)

  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  if (response.body !== null) {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
  }
  res.end()
}

function pickHeader(value: string | Array<string> | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value[0] : value
}

export const config = {
  runtime: 'nodejs',
}
