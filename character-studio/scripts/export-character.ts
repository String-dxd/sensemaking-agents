// Export CLI (plan 011 step 2): `.character.json` → `.companion.glb` + a
// size/stats report. Usage:
//   pnpm export:character -- path/to/foo.character.json [--no-compress]
//
// Node-only: loads GLBs via three's headless GLTFLoader.parse and the clips
// GLB via gltf-transform, then runs the pure `compileCharacter`.

import { readFileSync, writeFileSync } from 'node:fs'
import { compileCharacter } from '../src/core/export/compile'
import { CHARACTER_FILE_EXTENSION, parseSpec } from '../src/core/spec/io'
import { loadCompileAssets } from './lib/node-assets'

function fmtMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const compress = !args.includes('--no-compress')
  const input = args.find((a) => a.endsWith(CHARACTER_FILE_EXTENSION) || a.endsWith('.json'))
  if (!input) {
    console.error(`usage: export:character -- <file>${CHARACTER_FILE_EXTENSION} [--no-compress]`)
    process.exit(1)
  }

  const spec = parseSpec(readFileSync(input, 'utf8'))
  const assets = await loadCompileAssets(spec)
  const { glb, stats } = await compileCharacter(spec, assets, { compress })

  const out = input.replace(/\.character\.json$/, '.companion.glb').replace(/\.json$/, '.companion.glb')
  writeFileSync(out, glb)

  const lines = [
    '',
    `  Character:   ${spec.meta.name} (${spec.meta.archetype} / ${spec.meta.personality})`,
    `  Output:      ${out}`,
    `  Triangles:   ${stats.triangles.toLocaleString()}`,
    `  Nodes:       ${stats.nodes}   Meshes: ${stats.meshes}   Skins: ${stats.skins}`,
    `  Clips (${stats.clips.length}):   ${stats.clips.join(', ')}`,
    `  Textures:    ${fmtMB(stats.textureBytes)} (PNG, in-GLB)`,
    `  Compression: ${stats.compressed ? 'meshopt (lossless)' : 'none'}`,
    `  Total size:  ${fmtMB(stats.totalBytes)} ${stats.overBudget ? '  ⚠️  OVER 8 MB BUDGET' : '(within 8 MB budget)'}`,
    '',
  ]
  console.log(lines.join('\n'))
  if (stats.overBudget) process.exitCode = 2
}

main().catch((err) => {
  console.error('export:character failed:', err)
  process.exit(1)
})
