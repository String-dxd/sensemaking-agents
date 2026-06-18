import * as THREE from 'three'
import { resolveBuildPlan } from '../bird/buildPlan'
import type { PatternZone, ProceduralBase } from '../bird/genome'
import { makeFaceMaterial } from './facePainter'
import { buildBeak } from './parts/beak'
import { buildBodyHead } from './parts/bodyHead'
import { buildComb, buildWattle } from './parts/comb'
import { buildCrest, buildCrown, buildEarTufts } from './parts/crest'
import { buildLeg } from './parts/legs'
import { buildTail } from './parts/tail'
import { addOutline } from './parts/util'
import { buildWing } from './parts/wing'
import { makePlumagePattern } from './plumagePattern'
import { toonMat } from './toon'

// The from-scratch bird assembler. Returns the SAME { root, attach, dispose }
// contract scene/Bird.tsx expects. Each species resolves to a distinct archetype
// (bowerbird/songbird/eagle/duck/ostrich/chicken) with its own anatomy.

const OUTLINE_COLOR = '#241a1a'

export interface ProceduralBird {
  root: THREE.Group
  attach: { head: THREE.Object3D; held: THREE.Object3D; body: THREE.Object3D }
  /** Per-frame procedural idle/walk: beak chatter, wing flap, leg walk cycle, bob. */
  update: (t: number) => void
  dispose: () => void
}

export function buildBird(base: ProceduralBase, gradient: THREE.Texture): ProceduralBird {
  const mode = typeof location !== 'undefined' && new URLSearchParams(location.search).get('set') === 'species' ? 'species' : 'archetype'
  const plan = resolveBuildPlan(base, mode)
  const root = new THREE.Group()
  root.scale.setScalar(plan.scale)

  const pat = base.pattern && base.pattern.type !== 'none' ? base.pattern : null
  const zoneMat = (zone: PatternZone, color: string, name: string): THREE.MeshToonMaterial => {
    if (pat && pat.zone === zone) {
      const tex = makePlumagePattern(color, pat)
      if (tex) return toonMat({ gradientMap: gradient, map: tex, color: '#ffffff', name })
    }
    return toonMat({ gradientMap: gradient, color, name })
  }

  const outlineMat = new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide })
  const bodyMat = zoneMat('back', plan.colors.back, 'zone:back')
  const bellyMat = zoneMat('belly', plan.colors.belly, 'zone:belly')
  const headMat = makeFaceMaterial(plan.face, plan.painterPalette, plan.cheekMark, gradient)

  const bh = buildBodyHead(plan, { body: bodyMat, belly: bellyMat, head: headMat }, outlineMat)
  root.add(bh.group)
  const head = bh.headGroup
  const hr = plan.head.r

  // Beak / bill — buried into the head front (beakScale oversizes it for toucan).
  const beak = buildBeak(plan.beakStyle, hr, plan.colors.beak, gradient, plan.beakScale ?? 1)
  head.add(beak.group)
  const beakMeshes: THREE.Mesh[] = []
  beak.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) beakMeshes.push(o as THREE.Mesh)
  })
  for (const m of beakMeshes) addOutline(m, m.parent ?? beak.group, outlineMat)

  // Chicken comb + wattle.
  if (plan.comb) head.add(buildComb(hr, gradient))
  if (plan.wattle) head.add(buildWattle(hr, gradient))

  // Eagle brow ridge — two dark angled bars over the eyes for a fierce read.
  if (plan.brow) {
    const browMat = new THREE.MeshToonMaterial({ gradientMap: gradient, color: '#2a1d18' })
    for (const s of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(hr * 0.18, hr * 0.07, hr * 0.3), browMat)
      bar.position.set(hr * 0.84, hr * 0.34, s * hr * 0.32)
      bar.rotation.set(0, 0, s * 0.18)
      bar.rotation.y = s * 0.25
      head.add(bar)
    }
  }

  // Head feathers — one of: owl ear tufts, peacock crown, or a crest (skipped
  // when a comb owns the crown).
  if (plan.earTufts) {
    head.add(buildEarTufts(hr, plan.colors.back, gradient))
  } else if (plan.crownDots) {
    head.add(buildCrown(hr, plan.colors.accent, gradient))
  } else if (!plan.comb) {
    const crest = buildCrest(plan.crest, hr, plan.colors.accent, gradient)
    if (crest) {
      crest.position.set(-hr * 0.08, hr * 0.84, 0)
      crest.rotation.z = -0.12
      head.add(crest)
    }
  }

  // Wings — feather fans at the flanks, opposite splay (shape is z-symmetric).
  const mkWing = (sideSign: number) => {
    const w = buildWing(plan.wing, plan.colors.back, plan.colors.accent, gradient)
    // Root slightly BEHIND center and OUT at the flank so the wing hangs at the
    // side/back, never crossing the chest.
    w.group.position.set(-plan.body.r * 0.04, bh.shoulderY, sideSign * (bh.shoulderR + 0.02))
    w.group.rotation.set(-sideSign * (plan.wing.splay + 0.06), 0, -plan.wing.lean)
    for (const c of [...w.group.children]) {
      const m = c as THREE.Mesh
      if (m.isMesh) addOutline(m, w.group, outlineMat)
    }
    root.add(w.group)
    return w
  }
  const wingL = mkWing(+1)
  const wingR = mkWing(-1)
  void wingL

  // Tail fan, sized per archetype (peacock gets a wide eye-spotted fan).
  const tail = buildTail(plan.tailKind, plan.colors.accent, gradient, {
    blades: plan.tail.blades,
    eyespot: plan.eyespotTail,
    spread: plan.eyespotTail ? 1.3 : undefined,
  })
  tail.scale.setScalar(plan.tail.length / 0.34)
  tail.position.set(-plan.body.r * plan.body.scaleX * 0.78, plan.body.cy - plan.body.h * 0.16, 0)
  root.add(tail)

  // Legs at the body bottom (articulated hip+knee); feet land near y=0.
  const legAttachY = bh.bodyBottomY + 0.04
  const legL = buildLeg(plan.colors.legs, plan.legs.len, gradient, plan.legs.style, plan.legs.thick)
  legL.group.position.set(0.04, legAttachY, plan.legs.out)
  root.add(legL.group)
  const legR = buildLeg(plan.colors.legs, plan.legs.len, gradient, plan.legs.style, plan.legs.thick)
  legR.group.position.set(0.04, legAttachY, -plan.legs.out)
  root.add(legR.group)

  // Accessory attach nodes.
  const held = new THREE.Group()
  held.position.set(0, wingR.tipLocalY * 0.92, 0)
  wingR.group.add(held)
  const bodyAttach = new THREE.Group()
  bodyAttach.position.set(plan.body.r * 0.4, bh.shoulderY - 0.05, 0)
  root.add(bodyAttach)

  // ── Procedural idle/walk animation ──────────────────────────────────────────
  const splayMag = plan.wing.splay
  const walkSpeed = 3.6
  const update = (t: number) => {
    // Beak: a gentle jaw open/close chatter.
    beak.lowerPivot.rotation.z = -(0.06 + 0.32 * (0.5 + 0.5 * Math.sin(t * 4)))
    // Wings: flap OUTWARD/up only (never inward, so they can't swing through the
    // body). splayBase keeps them clear of the torso at rest.
    const flap = 0.2 * (0.5 + 0.5 * Math.sin(t * 3.1)) // 0..0.2
    const splayBase = splayMag + 0.06
    wingL.group.rotation.x = -(splayBase + flap)
    wingR.group.rotation.x = splayBase + flap
    // Legs: a human-like walk — hip swings fore/aft, knee bends, legs out of phase.
    const stepL = t * walkSpeed
    const stepR = t * walkSpeed + Math.PI
    legL.group.rotation.z = 0.5 * Math.sin(stepL)
    legL.knee.rotation.z = -0.55 * Math.max(0, Math.sin(stepL + 1.0))
    legR.group.rotation.z = 0.5 * Math.sin(stepR)
    legR.knee.rotation.z = -0.55 * Math.max(0, Math.sin(stepR + 1.0))
    // Gentle whole-body bob synced to the stride (twice per cycle).
    root.position.y = 0.02 * Math.sin(t * walkSpeed * 2) - 0.008
  }

  const dispose = () => {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
      for (const m of mats) {
        const mat = m as THREE.MeshToonMaterial
        if (mat.map) mat.map.dispose()
        mat.dispose()
      }
    })
  }

  return { root, attach: { head, held, body: bodyAttach }, update, dispose }
}
