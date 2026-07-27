// Fails if any chunk containing three.js's WebGLRenderer is statically
// imported (directly) by the _app route chunk or the entry chunk.
//
// Three.js is only needed once the engine boots, which is strictly after
// hydration. A static edge from the entry/_app graph forces the browser to
// download and parse the whole renderer before it can hydrate — the
// regression this guards against. Run after `pnpm build`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'dist/client/assets'
const files = readdirSync(dir).filter((f) => f.endsWith('.js'))
const threeChunks = files.filter((f) =>
  readFileSync(join(dir, f), 'utf8').includes('WebGLRenderer'),
)
if (threeChunks.length === 0) throw new Error('no three chunk found — build layout changed?')
const offenders = []
for (const f of files) {
  const src = readFileSync(join(dir, f), 'utf8')
  const staticImports = [...src.matchAll(/from\s*["']\.\/([^"']+)["']/g)].map((m) => m[1])
  for (const t of threeChunks) {
    if (f !== t && staticImports.includes(t) && /(_app|^main|^client|^index)/.test(f)) {
      offenders.push(`${f} statically imports ${t}`)
    }
  }
}
console.log('three-bearing chunks:', threeChunks.join(', '))
if (offenders.length) {
  console.error(offenders.join('\n'))
  process.exit(1)
}
console.log('ok: no entry/_app chunk statically imports three')
