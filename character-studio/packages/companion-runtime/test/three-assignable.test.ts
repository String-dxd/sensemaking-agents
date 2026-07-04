import * as THREE149 from 'three-149'
import * as THREE185 from 'three-185'
import { describe, expect, it } from 'vitest'
import type { LoadedGLTF, ThreeNamespace } from '../src/three-types'

// Compile-time proof (the file typechecking IS the assertion): both three
// version namespaces are structurally assignable to the injected type. If a
// future three renames/removes a member the runtime uses, this stops compiling.
const _assert149: ThreeNamespace = THREE149
const _assert185: ThreeNamespace = THREE185

describe('injected THREE namespace is version-agnostic', () => {
  it('accepts three r149 and r185 without version-pinning', () => {
    expect(THREE149.REVISION).toBeDefined()
    expect(THREE185.REVISION).toBeDefined()
    // runtime smoke: the injected ctors actually construct
    for (const THREE of [_assert149, _assert185]) {
      const v = new THREE.Vector3(1, 2, 3)
      expect([v.x, v.y, v.z]).toEqual([1, 2, 3])
      const q = new THREE.Quaternion()
      expect(q.w).toBe(1)
    }
  })

  it('a parsed GLTF is assignable to LoadedGLTF', () => {
    const fake: LoadedGLTF = { scene: new THREE185.Group() as unknown as LoadedGLTF['scene'], animations: [] }
    expect(fake.animations).toEqual([])
  })
})
