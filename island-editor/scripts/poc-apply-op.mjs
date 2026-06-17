// THROWAWAY PROOF-OF-CONCEPT for plan 001 — not the production runner.
// Proves the contract's clone-then-brush + re-validate loop for ONE op
// (`raiseRegion`) using plain `node` (no deps, no TS loader). The real runner
// must import the actual pure core (islandSpec.ts/brush.ts via tsx); here the two
// helpers it needs are INLINED so the PoC runs standalone. Run: node island-editor/scripts/poc-apply-op.mjs

// --- inlined: minimal seed spec (mirrors seedFromCurrentIsland shape, tiny relief) ---
const RES = 8
const seed = {
  version: 1,
  worldSize: 24,
  coastline: [
    { x: 5, z: 0 }, { x: 0, z: 5 }, { x: -5, z: 0 }, { x: 0, z: -5 },
  ],
  heightProfile: { seaLevel: 0, plateauHeight: 1, coastFalloff: 2, cliffSteepness: 0.45, seafloorDepth: -1.2 },
  relief: { resolution: RES, data: new Array(RES * RES).fill(0) },
}

// --- inlined: one raise dab (port of brush.ts#applyBrush, raise mode) — MUTATES its grid ---
function applyRaise(relief, worldSize, cx, cz, radius, strength) {
  const res = relief.resolution, data = relief.data, half = worldSize / 2
  const cellW = worldSize / (res - 1), r2 = radius * radius
  for (let iz = 0; iz < res; iz++) for (let ix = 0; ix < res; ix++) {
    const wx = -half + ix * cellW, wz = -half + iz * cellW
    const dd = (wx - cx) ** 2 + (wz - cz) ** 2
    if (dd > r2) continue
    const u = Math.min(1, Math.sqrt(dd) / radius), k = 1 - u * u
    data[iz * res + ix] += k * k * strength // falloff² · strength
  }
}

// --- the immutable op: clone BEFORE the in-place brush (the contract's key rule) ---
function raiseRegion(spec, { x, z, radius, strength }) {
  const data = spec.relief.data.slice() // copy first — applyRaise mutates in place
  const relief = { resolution: spec.relief.resolution, data }
  applyRaise(relief, spec.worldSize, x, z, radius, strength)
  return { ...spec, relief }
}

// --- inlined: minimal structural validator (subset of exportSpec.ts#deserializeSpec) ---
function validate(s) {
  if (s.version !== 1) throw new Error('version must be 1')
  if (!Number.isFinite(s.worldSize)) throw new Error('worldSize not finite')
  if (!Array.isArray(s.coastline) || s.coastline.length < 3) throw new Error('coastline needs ≥ 3 points')
  const e = s.relief.resolution ** 2
  if (s.relief.data.length !== e) throw new Error('relief length must be resolution²')
  if (!s.relief.data.every(Number.isFinite)) throw new Error('relief has non-finite values')
}

const next = raiseRegion(seed, { x: 0, z: 0, radius: 6, strength: 0.5 })
validate(next)
const inputUntouched = seed.relief.data.every((v) => v === 0)
if (!inputUntouched) throw new Error('immutability broken: input grid mutated')

console.log(JSON.stringify(next, null, 2))
console.log(`max relief = ${Math.max(...next.relief.data).toFixed(3)} (input grid untouched: ${inputUntouched})`)
console.log('VALID ✓')
