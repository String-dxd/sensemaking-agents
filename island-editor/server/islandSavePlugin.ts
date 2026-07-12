// Dev-server middleware that persists the island spec to a repo-tracked file
// (plan 023). The browser cannot write into the repo; the vite dev server can,
// so this plugin exposes exactly two routes:
//
//   POST /api/island/save — validate lightly + write saves/island.json
//   GET  /api/island/load — return that file (404 if never saved)
//
// Node context only (node:fs / node:path) — NO browser/react imports. Full
// spec validation already happens client-side (`specIO.validateSpecObject`
// via `repoStore`); the server only sanity-checks JSON shape and never
// derives the write path from the request. Dev-only by construction:
// `configureServer` does not exist in static/preview deployments.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'

/** Repo-relative path of the tracked save file (see saves/README.md). */
export const SAVE_FILE = 'saves/island.json'

/** Request body cap — a serialized island spec is ~tens of KB; 2 MB is generous. */
const MAX_BODY_BYTES = 2 * 1024 * 1024

// Minimal structural req/res shapes — node's IncomingMessage/ServerResponse
// satisfy these, and the unit tests drive the handler with small fakes.
export interface IslandRouteRequest {
  method?: string
  url?: string
  on(event: 'data', listener: (chunk: unknown) => void): unknown
  on(event: 'end', listener: () => void): unknown
}

export interface IslandRouteResponse {
  statusCode: number
  setHeader(name: string, value: string): unknown
  end(body?: string): unknown
}

/** Handle the two island routes; call `next()` for anything else. Exported
 *  separately from the plugin so tests can drive it without a vite server. */
export function handleIslandRoute(
  req: IslandRouteRequest,
  res: IslandRouteResponse,
  next: () => void,
  root: string,
): void {
  const pathname = (req.url ?? '').split('?')[0]
  const savePath = join(root, SAVE_FILE)

  if (req.method === 'POST' && pathname === '/api/island/save') {
    const chunks: Buffer[] = []
    let received = 0
    let overflowed = false
    req.on('data', (chunk) => {
      if (overflowed) return
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
      received += buf.length
      if (received > MAX_BODY_BYTES) {
        overflowed = true
        res.statusCode = 413
        res.end('Island spec too large (2 MB cap).')
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (overflowed) return
      const text = Buffer.concat(chunks).toString('utf8')
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        res.statusCode = 400
        res.end('Body is not valid JSON.')
        return
      }
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as Record<string, unknown>).version !== 'number'
      ) {
        res.statusCode = 400
        res.end('Body is not an island spec (missing numeric version).')
        return
      }
      // Write the RAW received text — the client already serialized it.
      mkdirSync(dirname(savePath), { recursive: true })
      writeFileSync(savePath, text, 'utf8')
      res.statusCode = 204
      res.end()
    })
    return
  }

  if (req.method === 'GET' && pathname === '/api/island/load') {
    if (!existsSync(savePath)) {
      res.statusCode = 404
      res.end('No saved island.')
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(readFileSync(savePath, 'utf8'))
    return
  }

  next()
}

export function islandSavePlugin(root = process.cwd()): Plugin {
  return {
    name: 'island-save',
    configureServer(server) {
      server.middlewares.use((req, res, next) => handleIslandRoute(req, res, next, root))
    },
  }
}
