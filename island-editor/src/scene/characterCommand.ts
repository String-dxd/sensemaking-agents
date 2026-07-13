// Click-to-move command channel (plan 026): IslandTerrain (via App) bumps
// `seq` with a target; CharacterActor's useFrame consumes it when the seq
// changes. Mutable module singleton on purpose — same rationale as
// characterPose.ts (per-frame data, single character).
export const characterCommand = { seq: 0, x: 0, z: 0 }
export function issueMoveCommand(x: number, z: number): void {
  characterCommand.x = x
  characterCommand.z = z
  characterCommand.seq++
}
