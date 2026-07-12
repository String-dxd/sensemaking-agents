// Live world pose of the (single) placed character, written by
// CharacterActor's useFrame and read by GrassLayer's useFrame (plan-024 fade
// disc follows the roaming chick). A mutable module singleton on purpose:
// per-frame data must not flow through React state (no re-renders), and the
// editor has at most one character (withSingleCharacter, plan 017).
// `swimming` is set while the bird is at the swim waterline; it drives the
// sea shader's wake rings (plan 027, read in SeaSurface's useFrame).
export const characterPose = { x: 0, y: 0, z: 0, active: false, swimming: false }
