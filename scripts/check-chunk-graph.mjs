// Guards the boot-path bundle shape: no chunk the browser must load to
// hydrate may reach three.js through STATIC imports.
//
// Three.js is only needed once the engine boots, which is strictly after
// hydration. A static edge from the entry/_app graph forces the browser to
// download and parse the whole renderer before it can hydrate — the
// regression this guards against. Run after `pnpm build`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist/client/assets'
const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
const read = (f) => readFileSync(join(dir, f), 'utf8')

// Identify the chunk that DEFINES three by its own internal error strings.
// Matching bare `WebGLRenderer` would also hit consumer chunks that merely
// call `new THREE.WebGLRenderer()` after dynamically importing three — those
// are exactly the chunks this check must treat as clean.
const threeChunks = files.filter((f) => read(f).includes('THREE.WebGLRenderer:'))
if (threeChunks.length === 0) throw new Error('no three chunk found — build layout changed?')

// Static edges only: `from"./x"` and bare side-effect `import"./x"`. Dynamic
// `import("./x")` never matches (the paren blocks the bare-import pattern and
// there is no `from`), which is the point — dynamic edges are what we want.
const staticImports = new Map(
  files.map((f) => {
    const src = read(f)
    const out = new Set()
    for (const m of src.matchAll(/from\s*["']\.\/([^"']+)["']/g)) out.add(m[1])
    for (const m of src.matchAll(/(?:^|[;\s{}])import\s*["']\.\/([^"']+)["']/g)) out.add(m[1])
    return [f, out]
  }),
)

// Transitive: a chunk is tainted if it statically imports three, or statically
// imports anything tainted. One-hop checking would miss three pulled in
// through an intermediate chunk.
const tainted = new Set(threeChunks)
for (let changed = true; changed; ) {
  changed = false
  for (const f of files) {
    if (tainted.has(f)) continue
    for (const t of staticImports.get(f)) {
      if (tainted.has(t)) {
        tainted.add(f)
        changed = true
        break
      }
    }
  }
}

// Chunks nobody statically imports are only reachable via `import()`, so they
// are off the synchronous path by construction (e.g. the engine's own entry
// chunk, which legitimately carries three).
const staticallyImported = new Set()
for (const f of files) for (const t of staticImports.get(f)) staticallyImported.add(t)

// The synchronous boot chunks: the `_app` layout chunk and the client entry.
// Dot-suffixed TanStack route chunks (`_app.history-<hash>.js`) are imported
// lazily on navigation, so they are deliberately excluded.
const isBootChunk = (f) => /^(_app|main|client|index)-[^.]*\.js$/.test(f)

const offenders = files.filter(
  (f) => isBootChunk(f) && tainted.has(f) && staticallyImported.has(f),
)

console.log('three-defining chunks:', threeChunks.join(', '))
if (offenders.length) {
  for (const f of offenders) {
    const via = [...staticImports.get(f)].filter((t) => tainted.has(t))
    console.error(`${f} statically reaches three via: ${via.join(', ')}`)
  }
  process.exit(1)
}
console.log('ok: no entry/_app chunk statically imports three')
