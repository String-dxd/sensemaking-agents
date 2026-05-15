import * as THREE from 'three'

export function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) {
      mesh.geometry.dispose()
    }
    const material = mesh.material
    if (Array.isArray(material)) {
      for (const item of material) disposeMaterial(item)
    } else if (material) {
      disposeMaterial(material)
    }
  })
}

function disposeMaterial(material: THREE.Material) {
  const textureFields = [
    'map',
    'alphaMap',
    'aoMap',
    'bumpMap',
    'displacementMap',
    'emissiveMap',
    'envMap',
    'lightMap',
    'metalnessMap',
    'normalMap',
    'roughnessMap',
  ] as const
  const materialRecord = material as THREE.Material & Record<string, unknown>
  for (const field of textureFields) {
    disposeTexturesInValue(materialRecord[field])
  }
  disposeTexturesInValue(materialRecord.uniforms)
  material.dispose()
}

function disposeTexturesInValue(value: unknown, seen = new Set<unknown>()) {
  if (!value || seen.has(value)) return
  seen.add(value)
  if (value instanceof THREE.Texture) {
    value.dispose()
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) disposeTexturesInValue(item, seen)
    return
  }
  if (typeof value !== 'object') return
  for (const child of Object.values(value)) {
    disposeTexturesInValue(child, seen)
  }
}
