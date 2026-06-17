import * as THREE from 'three'

// V1 PLACEHOLDER garments — crude procedural meshes that prove the
// swap/attach/recolor SYSTEM. They are intentionally simple and their fit is a
// best-effort guess (tune `fit` per item from visual feedback). AC-grade
// clothing arrives as authored, skinned GLBs via ASSET-CONTRACT.md.
//
// Each item is a Group whose materials are named 'base' / 'accent' so
// recolorItem can tint them. All rigid for V1 (parented to an attach node).

export interface ItemFit {
  /** Local offset within the attach node (rig-unit space; root applies 0.30). */
  position: [number, number, number]
  rotation?: [number, number, number]
  scale: number
}

export interface BuiltItem {
  group: THREE.Group
  fit: ItemFit
}

function toonMat(gradient: THREE.Texture, color: string, name: 'base' | 'accent'): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: gradient })
  m.name = name
  return m
}

export function buildItem(
  itemId: string,
  gradient: THREE.Texture,
  colors: { base: string; accent?: string },
): BuiltItem | null {
  const base = colors.base
  const accent = colors.accent ?? colors.base
  const g = new THREE.Group()
  g.name = `item:${itemId}`

  switch (itemId) {
    case 'cap': {
      const crown = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
        toonMat(gradient, base, 'base'),
      )
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20),
        toonMat(gradient, accent, 'accent'),
      )
      brim.position.set(0, -0.01, 0.3)
      brim.scale.set(1, 1, 0.55)
      g.add(crown, brim)
      return { group: g, fit: { position: [0, 0.4, 0], scale: 0.85 } }
    }
    case 'beanie': {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.44, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62),
        toonMat(gradient, base, 'base'),
      )
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.46, 0.46, 0.14, 20, 1, true),
        toonMat(gradient, accent, 'accent'),
      )
      band.position.set(0, -0.05, 0)
      g.add(dome, band)
      return { group: g, fit: { position: [0, 0.38, 0], scale: 0.85 } }
    }
    case 'scarf': {
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.12, 12, 22),
        toonMat(gradient, base, 'base'),
      )
      band.rotation.x = Math.PI / 2
      band.scale.set(1, 1, 0.7)
      g.add(band)
      return { group: g, fit: { position: [0, 0.2, 0], scale: 0.9 } }
    }
    case 'leaf': {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 4), toonMat(gradient, base, 'base'))
      leaf.rotation.set(Math.PI, 0, 0)
      g.add(leaf)
      return { group: g, fit: { position: [0, 0, 0.12], rotation: [0.5, 0, 0], scale: 0.7 } }
    }
    default:
      return null
  }
}

export function recolorItem(group: THREE.Object3D, colors: { base: string; accent?: string }): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || !mesh.material) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (m.name === 'base') {
        ;(m as THREE.MeshToonMaterial).color.set(colors.base)
        m.needsUpdate = true
      } else if (m.name === 'accent' && colors.accent) {
        ;(m as THREE.MeshToonMaterial).color.set(colors.accent)
        m.needsUpdate = true
      }
    }
  })
}
