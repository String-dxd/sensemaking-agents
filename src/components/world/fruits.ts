import * as THREE from 'three'
import { addWorldHitTarget, attachWorldHotspot, hotspotForSkillFruit } from './hotspots'
import type { SkillFruitDescriptor, ValueTreeDescriptor } from './vipsWorldMapping'

export function attachFruitToTrees(
  root: THREE.Group,
  fruit: SkillFruitDescriptor[],
  trees: ValueTreeDescriptor[],
) {
  const treeGroups = new Map(root.children.map((child) => [child.name, child]))
  const fallbackTrees = trees.map((tree) => tree.id)
  for (const skill of fruit) {
    const targetId =
      skill.valueTreeId ?? fallbackTrees[skill.placementSeed % Math.max(1, fallbackTrees.length)]
    const target = targetId ? treeGroups.get(targetId) : undefined
    if (!target) continue
    const count = Math.min(7, Math.max(1, skill.count))
    for (let i = 0; i < count; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.045 + skill.ripeness * 0.025, 10, 8),
        new THREE.MeshStandardMaterial({
          color: skill.color,
          roughness: 0.7,
          transparent: skill.evidenceState === 'pending',
          opacity: skill.evidenceState === 'pending' ? 0.5 : 0.95,
        }),
      )
      attachWorldHotspot(mesh, hotspotForSkillFruit(skill))
      addWorldHitTarget(mesh, {
        name: `${skill.id}-${i}-skill-hit-target`,
        scale: new THREE.Vector3(0.2, 0.2, 0.2),
        priority: 35,
      })
      const angle = ((skill.placementSeed + i * 53) % 360) * (Math.PI / 180)
      mesh.position.set(Math.cos(angle) * 0.24, 0.78 + (i % 3) * 0.08, Math.sin(angle) * 0.18)
      target.add(mesh)
    }
  }
}
