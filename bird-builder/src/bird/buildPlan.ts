// The geometry-facing build plan — the from-scratch replacement for the Kira
// CharacterConfig. Each genome species maps to a distinct avian ARCHETYPE with
// its OWN anatomy (body mass, head, beak/bill, neck, comb, brow, feet, wing
// feather count, tail) so the six species read as genuinely different AC birds,
// not one reskinned base.
//
// Face params are still pulled from the (kept) canvas painter path for now via
// resolveCharacter, so the 8 eye archetypes + per-species face tints keep working;
// that is the last Kira tie and is excised once the silhouettes are signed off.

import type { FaceParams, PainterPalette } from '../rig/facePainter'
import type { CrestType, ProceduralBase, SpeciesId, TailType } from './genome'
import { resolveCharacter } from './morphology'

export type Archetype = 'bowerbird' | 'songbird' | 'eagle' | 'duck' | 'ostrich' | 'chicken'
export type BeakStyle = 'cone' | 'hook' | 'bill' | 'stout' | 'bent'
export type BuildMode = 'archetype' | 'species'

export interface ArchPlan {
  archetype: Archetype
  scale: number
  body: { r: number; h: number; cy: number; breast: number; bulge: number; flatten: number; scaleX: number; scaleZ: number }
  head: { r: number; cy: number; squashY: number; forward: number }
  neck: { enabled: boolean; y: number; h: number; topR: number; botR: number }
  beakStyle: BeakStyle
  beakScale?: number // oversized beak (toucan)
  comb: boolean
  wattle: boolean
  brow: boolean
  crownDots?: boolean // peacock crown
  eyespotTail?: boolean // peacock tail
  earTufts?: boolean // owl
  crest: CrestType
  wing: { feathers: number; length: number; chord: number; depth: number; lean: number; splay: number }
  legs: { len: number; out: number; style: 'toes' | 'paddle'; thick: number }
  tail: { blades: number; length: number }
}

// A signature-species plan = an ArchPlan reused as geometry + baked recognizable
// colors + small face tweaks (the "recognizable exact species" direction).
type SignaturePlan = ArchPlan & {
  sigColors: { back: string; belly: string; accent: string; beak: string; legs: string; eye: string }
  sigFace?: Partial<FaceParams>
}

export interface BuildPlan extends ArchPlan {
  shoulderY: number
  shoulderOut: number
  bodyBottomY: number
  tailKind: TailType
  colors: { back: string; belly: string; accent: string; beak: string; legs: string; eye: string }
  face: FaceParams
  painterPalette: PainterPalette
  cheekMark: 'none' | 'dot' | 'swirl'
}

// ── The six archetypes. Each is a deliberately distinct silhouette + signature. ──
const ARCHETYPES: Record<Archetype, ArchPlan> = {
  // Plump, crested songbird — the project's namesake hero.
  bowerbird: {
    archetype: 'bowerbird',
    scale: 0.82,
    body: { r: 0.4, h: 0.74, cy: 0.57, breast: 0.16, bulge: 0.22, flatten: 0.18, scaleX: 1.0, scaleZ: 1.0 },
    head: { r: 0.41, cy: 1.04, squashY: 1.06, forward: 0.0 },
    neck: { enabled: false, y: 0, h: 0, topR: 0, botR: 0 },
    beakStyle: 'cone',
    comb: false,
    wattle: false,
    brow: false,
    crest: 'pointed',
    wing: { feathers: 5, length: 0.5, chord: 0.44, depth: 0.07, lean: 0.08, splay: 0.16 },
    legs: { len: 0.22, out: 0.085, style: 'toes', thick: 1 },
    tail: { blades: 4, length: 0.34 },
  },
  // Small, slim, dainty — big head on a little body, tiny tuft + perky tail.
  songbird: {
    archetype: 'songbird',
    scale: 0.86,
    body: { r: 0.32, h: 0.6, cy: 0.46, breast: 0.12, bulge: 0.16, flatten: 0.16, scaleX: 0.92, scaleZ: 0.95 },
    head: { r: 0.37, cy: 0.86, squashY: 1.08, forward: 0.0 },
    neck: { enabled: false, y: 0, h: 0, topR: 0, botR: 0 },
    beakStyle: 'cone',
    comb: false,
    wattle: false,
    brow: false,
    crest: 'tuft',
    wing: { feathers: 4, length: 0.4, chord: 0.36, depth: 0.06, lean: 0.06, splay: 0.18 },
    legs: { len: 0.18, out: 0.07, style: 'toes', thick: 0.85 },
    tail: { blades: 3, length: 0.38 },
  },
  // Broad, imposing raptor — barrel chest, big wide head, hooked beak + brow ridge.
  eagle: {
    archetype: 'eagle',
    scale: 0.78,
    body: { r: 0.46, h: 0.78, cy: 0.56, breast: 0.2, bulge: 0.14, flatten: 0.22, scaleX: 1.14, scaleZ: 0.98 },
    head: { r: 0.46, cy: 1.08, squashY: 1.0, forward: 0.05 },
    neck: { enabled: false, y: 0, h: 0, topR: 0, botR: 0 },
    beakStyle: 'hook',
    comb: false,
    wattle: false,
    brow: true,
    crest: 'tuft',
    wing: { feathers: 6, length: 0.58, chord: 0.5, depth: 0.08, lean: 0.06, splay: 0.14 },
    legs: { len: 0.2, out: 0.11, style: 'toes', thick: 1.35 },
    tail: { blades: 4, length: 0.32 },
  },
  // Wide, low, breast-forward — flat spatula bill, no neck, paddle feet.
  duck: {
    archetype: 'duck',
    scale: 0.84,
    body: { r: 0.44, h: 0.6, cy: 0.5, breast: 0.24, bulge: 0.2, flatten: 0.12, scaleX: 1.08, scaleZ: 1.02 },
    head: { r: 0.36, cy: 0.92, squashY: 0.95, forward: 0.02 },
    neck: { enabled: false, y: 0, h: 0, topR: 0, botR: 0 },
    beakStyle: 'bill',
    comb: false,
    wattle: false,
    brow: false,
    crest: 'none',
    wing: { feathers: 5, length: 0.42, chord: 0.4, depth: 0.06, lean: 0.06, splay: 0.16 },
    legs: { len: 0.16, out: 0.11, style: 'paddle', thick: 1 },
    tail: { blades: 3, length: 0.24 },
  },
  // Tall — slim body on a long visible NECK with a small head; long legs, big tail.
  ostrich: {
    archetype: 'ostrich',
    scale: 0.6,
    body: { r: 0.34, h: 0.62, cy: 0.92, breast: 0.1, bulge: 0.18, flatten: 0.16, scaleX: 0.94, scaleZ: 0.92 },
    head: { r: 0.26, cy: 1.74, squashY: 1.05, forward: 0.03 },
    neck: { enabled: true, y: 1.4, h: 0.5, topR: 0.085, botR: 0.15 },
    beakStyle: 'cone',
    comb: false,
    wattle: false,
    brow: false,
    crest: 'tuft',
    wing: { feathers: 5, length: 0.42, chord: 0.36, depth: 0.06, lean: 0.06, splay: 0.16 },
    legs: { len: 0.58, out: 0.1, style: 'toes', thick: 0.8 },
    tail: { blades: 5, length: 0.48 },
  },
  // Blocky barrel — red COMB on the crown + WATTLE under a short stout beak.
  chicken: {
    archetype: 'chicken',
    scale: 0.8,
    body: { r: 0.45, h: 0.66, cy: 0.54, breast: 0.16, bulge: 0.22, flatten: 0.18, scaleX: 1.05, scaleZ: 1.0 },
    head: { r: 0.38, cy: 1.0, squashY: 1.0, forward: 0.0 },
    neck: { enabled: false, y: 0, h: 0, topR: 0, botR: 0 },
    beakStyle: 'stout',
    comb: true,
    wattle: true,
    brow: false,
    crest: 'none',
    wing: { feathers: 5, length: 0.46, chord: 0.42, depth: 0.07, lean: 0.07, splay: 0.16 },
    legs: { len: 0.2, out: 0.11, style: 'paddle', thick: 1.1 },
    tail: { blades: 4, length: 0.3 },
  },
}

const SPECIES_ARCHETYPE: Record<SpeciesId, Archetype> = {
  flame: 'bowerbird',
  emerald: 'songbird',
  regent: 'eagle',
  satin: 'duck',
  twilight: 'ostrich',
  lilac: 'chicken',
}

// ── The "recognizable exact species" set (?set=species). Each slot becomes a
// specific, instantly-identifiable bird with baked signature colors + features. ──
const SIGNATURES: Record<SpeciesId, SignaturePlan> = {
  // CARDINAL — vivid red, tall crest, black face mask, orange beak.
  flame: {
    ...ARCHETYPES.bowerbird,
    crest: 'pointed',
    beakStyle: 'cone',
    sigColors: { back: '#cc1f2a', belly: '#d83440', accent: '#cc1f2a', beak: '#ff9d2e', legs: '#6b4a2a', eye: '#1a1a1a' },
    sigFace: { faceColor: '#211a1a', shine: true },
  },
  // TOUCAN — black body, white bib, HUGE orange beak.
  regent: {
    ...ARCHETYPES.bowerbird,
    body: { ...ARCHETYPES.bowerbird.body, r: 0.38, h: 0.7 },
    crest: 'none',
    beakStyle: 'cone',
    beakScale: 1.7,
    sigColors: { back: '#1b1b1f', belly: '#f4f1e8', accent: '#ff8a1e', beak: '#ff8a1e', legs: '#2a2a2a', eye: '#1a1a1a' },
    sigFace: { faceColor: '#1b1b1f', eyeRingColor: '#ffd24a', shine: true },
  },
  // PARROT — green, hooked beak, head tuft, yellow face patch.
  emerald: {
    ...ARCHETYPES.songbird,
    scale: 0.84,
    body: { ...ARCHETYPES.songbird.body, r: 0.36, h: 0.66, cy: 0.5 },
    head: { ...ARCHETYPES.songbird.head, r: 0.39, cy: 0.92 },
    crest: 'tuft',
    beakStyle: 'hook',
    sigColors: { back: '#2faa3a', belly: '#bfe89a', accent: '#f2c12e', beak: '#e8e0cc', legs: '#7a7a7a', eye: '#1a1a1a' },
    sigFace: { faceColor: '#f2d24a', shine: true },
  },
  // PEACOCK — blue, crown of dots, big eye-spot tail fan, slim neck.
  satin: {
    ...ARCHETYPES.ostrich,
    scale: 0.66,
    body: { ...ARCHETYPES.ostrich.body, r: 0.36, h: 0.6, cy: 0.78 },
    neck: { enabled: true, y: 1.2, h: 0.32, topR: 0.1, botR: 0.16 },
    head: { ...ARCHETYPES.ostrich.head, r: 0.24, cy: 1.46 },
    legs: { ...ARCHETYPES.ostrich.legs, len: 0.46 },
    crest: 'none',
    crownDots: true,
    eyespotTail: true,
    tail: { blades: 7, length: 0.62 },
    sigColors: { back: '#0f3fb0', belly: '#1aa6b8', accent: '#1aa6b8', beak: '#3a3a3a', legs: '#6b6b6b', eye: '#0a0a0a' },
    sigFace: { faceColor: '#0f3fb0', shine: true },
  },
  // OWL — round, BIG forward eyes, ear tufts, small hooked beak, pale facial disc.
  twilight: {
    ...ARCHETYPES.bowerbird,
    scale: 0.84,
    body: { ...ARCHETYPES.bowerbird.body, r: 0.42, h: 0.66, cy: 0.5 },
    head: { ...ARCHETYPES.bowerbird.head, r: 0.47, cy: 1.0, squashY: 1.0 },
    crest: 'none',
    earTufts: true,
    beakStyle: 'hook',
    sigColors: { back: '#7a5a3c', belly: '#e8d6b0', accent: '#5a4030', beak: '#e0a23b', legs: '#c08a3a', eye: '#1a1a1a' },
    sigFace: { faceColor: '#efe2c8', eyeWhite: 0.31, eyeZ: 0.26, shine: true, eyeRingColor: '#b78a4e', upperLid: 0, lowerLid: 0, lash: false },
  },
  // FLAMINGO — pink, long neck + long legs, down-bent black-tipped bill, tiny head.
  lilac: {
    ...ARCHETYPES.ostrich,
    scale: 0.66,
    body: { ...ARCHETYPES.ostrich.body, r: 0.31, h: 0.5, cy: 0.78 },
    neck: { enabled: true, y: 1.18, h: 0.5, topR: 0.07, botR: 0.12 },
    head: { ...ARCHETYPES.ostrich.head, r: 0.22, cy: 1.5 },
    legs: { ...ARCHETYPES.ostrich.legs, len: 0.5, out: 0.08 },
    beakStyle: 'bent',
    crest: 'none',
    tail: { blades: 4, length: 0.32 },
    sigColors: { back: '#ff8fbf', belly: '#ffc4dc', accent: '#ff6fa6', beak: '#2a2a2a', legs: '#ff8fbf', eye: '#1a1a1a' },
    sigFace: { faceColor: '#ffaecd', shine: true },
  },
}

const mul = (v: number, f: number | undefined): number => (f === undefined ? v : v * f)

function faceOf(base: ProceduralBase): { face: FaceParams; painterPalette: PainterPalette; cheekMark: 'none' | 'dot' | 'swirl' } {
  const c = resolveCharacter(base) // face params only (eye archetypes + species tints)
  const p = base.palette
  const face: FaceParams = {
    faceY: c.faceY,
    faceZ: c.faceZ,
    faceYOffset: c.faceYOffset,
    faceColor: p.faceColor ?? c.faceColor,
    cheekSize: c.cheekSize,
    cheekZ: c.cheekZ,
    eyeWhite: c.eyeWhite,
    eyeSquash: c.eyeSquash,
    eyeY: c.eyeY,
    eyeZ: c.eyeZ,
    eyeTilt: c.eyeTilt,
    pupilScaleX: c.pupilScaleX,
    pupilScaleY: c.pupilScaleY,
    pupilOffsetY: c.pupilOffsetY,
    upperLid: c.upperLid,
    lowerLid: c.lowerLid,
    lidColor: p.lidColor ?? c.lidColor,
    eyeRingColor: p.eyeRingColor ?? c.eyeRingColor,
    lash: c.lash,
    shine: c.shine,
    brow: c.brow,
    browW: c.browW,
  }
  const painterPalette: PainterPalette = { eye: p.eye, back: p.back, face: face.faceColor || p.belly, accent: p.accent }
  return { face, painterPalette, cheekMark: base.face.cheekMark ?? 'none' }
}

export function resolveBuildPlan(base: ProceduralBase, mode: BuildMode = 'archetype'): BuildPlan {
  const species = mode === 'species'
  const a: ArchPlan = species ? SIGNATURES[base.species] : ARCHETYPES[SPECIES_ARCHETYPE[base.species] ?? 'bowerbird']
  const m = base.morph ?? {}
  let { face, painterPalette, cheekMark } = faceOf(base)

  // Recognizable-species mode bakes signature colors + a few face tweaks so the
  // exact species reads regardless of the genome palette.
  let colors = {
    back: base.palette.back,
    belly: base.palette.belly,
    accent: base.palette.accent,
    beak: base.palette.beak,
    legs: base.palette.legs,
    eye: base.palette.eye,
  }
  if (species) {
    const sig = a as SignaturePlan
    colors = { ...sig.sigColors }
    if (sig.sigFace) face = { ...face, ...sig.sigFace }
    painterPalette = { eye: colors.eye, back: colors.back, face: face.faceColor || colors.belly, accent: colors.accent }
  }

  const body = { ...a.body, r: mul(a.body.r, m.body?.x), h: mul(a.body.h, m.body?.y) }
  const head = { ...a.head, r: mul(a.head.r, m.headSize) }

  return {
    ...a,
    body,
    head,
    legs: { ...a.legs, len: mul(a.legs.len, m.leg?.len) },
    wing: { ...a.wing, length: mul(a.wing.length, m.wing?.length) },
    // signature mode owns its crest; archetype mode keeps the archetype crest unless cleared
    crest: species ? a.crest : base.parts.crest === 'none' && a.crest !== 'none' ? a.crest : base.parts.crest,
    shoulderY: body.cy + body.h * 0.18,
    shoulderOut: body.r * body.scaleX * 0.9,
    bodyBottomY: body.cy - body.h * 0.5,
    tailKind: base.parts.tail,
    colors,
    face,
    painterPalette,
    cheekMark,
  }
}
