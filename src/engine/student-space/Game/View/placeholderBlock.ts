// Grey placeholder blocks for functional kinds with no editor asset yet
// (world-port U7, R7). DELIBERATELY conspicuous — a flat mid-grey box reads
// as "asset pending" on screen, so nobody mistakes it for finished art. The
// optional accent cap keeps species/state color couplings visible (fruit
// species palette, mailbox letters flag) without pretending to be a model.

import * as THREE from 'three'

export interface PlaceholderBlockOptions {
  width: number
  height: number
  depth: number
  /** Optional accent cap color (species palette / state signal). */
  accent?: THREE.ColorRepresentation
}

export interface PlaceholderBlock {
  group: THREE.Group
  body: THREE.Mesh
  bodyMaterial: THREE.MeshStandardMaterial
  /** Present only when `accent` was requested. */
  accent: THREE.Mesh | null
  accentMaterial: THREE.MeshStandardMaterial | null
}

export const PLACEHOLDER_GREY = 0x9a9a9a

/** A flat mid-grey box with its base at y = 0 (callers position the group). */
export function buildPlaceholderBlock(opts: PlaceholderBlockOptions): PlaceholderBlock {
  const group = new THREE.Group()
  group.name = 'placeholder-block'

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: PLACEHOLDER_GREY,
    roughness: 1,
    metalness: 0,
  })
  const body = new THREE.Mesh(new THREE.BoxGeometry(opts.width, opts.height, opts.depth), bodyMaterial)
  body.position.y = opts.height / 2
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  let accent: THREE.Mesh | null = null
  let accentMaterial: THREE.MeshStandardMaterial | null = null
  if (opts.accent !== undefined) {
    accentMaterial = new THREE.MeshStandardMaterial({
      color: opts.accent,
      roughness: 1,
      metalness: 0,
    })
    const capH = Math.min(0.08, opts.height * 0.2)
    accent = new THREE.Mesh(
      new THREE.BoxGeometry(opts.width * 0.6, capH, opts.depth * 0.6),
      accentMaterial,
    )
    accent.position.y = opts.height + capH / 2
    accent.castShadow = true
    group.add(accent)
  }

  return { group, body, bodyMaterial, accent, accentMaterial }
}
