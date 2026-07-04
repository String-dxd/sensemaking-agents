// Spring-bone parameter vocabulary (plan 003 step 1).
//
// Field names mirror VRM `VRMC_springBone-1.0` EXACTLY so the future export
// plan (plan 011) can serialize these types 1:1. Do not rename fields.
//
// Mapping to VRMC_springBone-1.0:
//   SpringJointParams.stiffness    → spring.joints[n].stiffness   (0–1; pull toward the animated pose)
//   SpringJointParams.gravityPower → spring.joints[n].gravityPower (m/s²-ish scalar)
//   SpringJointParams.gravityDir   → spring.joints[n].gravityDir   (unit vec3)
//   SpringJointParams.dragForce    → spring.joints[n].dragForce    (0–1; velocity damping)
//   SpringJointParams.hitRadius    → spring.joints[n].hitRadius    (m; particle radius vs colliders)
//   SpringChainDef                 → one entry of springs[] (ordered joints + colliderGroups refs)
//   SphereCollider                 → colliders[n] with shape.sphere { offset, radius }, node = boneName
//   ColliderGroup                  → colliderGroups[n] { name, colliders }
//
// All types are plain serializable data — vectors are [x, y, z] tuples, bone
// references are names (resolved against an Object3D root at rig creation).

export interface SpringJointParams {
  /** 0–1: how strongly the particle is pulled back toward the animated pose target. */
  stiffness: number
  /** Gravity acceleration magnitude applied to the particle (m/s²-ish). */
  gravityPower: number
  /** Gravity direction (unit vector, world space). */
  gravityDir: [number, number, number]
  /** 0–1: velocity damping per solver step (Verlet inertia is scaled by 1 - dragForce). */
  dragForce: number
  /** Particle radius (m) used against sphere colliders. */
  hitRadius: number
}

export interface SpringChainDef {
  name: string
  /** Ordered root→tip bone names; each bone after the first must be a direct child of the previous. */
  boneNames: string[]
  /** One entry per bone in `boneNames`. */
  joints: SpringJointParams[]
  /** Names of ColliderGroups this chain collides with. */
  colliderGroupRefs: string[]
}

export interface SphereCollider {
  /** Name of the bone/Object3D the collider is attached to. */
  boneName: string
  /** Sphere center offset in the bone's local space. */
  offset: [number, number, number]
  /** Sphere radius (m). */
  radius: number
}

export interface ColliderGroup {
  name: string
  colliders: SphereCollider[]
}
