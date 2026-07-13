// The character asset's runtime contract. CHARACTER_CLIPS mirrors the clips
// baked into public/models/character.glb — test/characterClips.test.ts fails
// if they drift. Order = the UI cycling order (friendly first).
export const CHARACTER_CLIPS = [
  'Walking',
  'Running',
  'Skip_Forward',
  'Wave_for_Help_2',
  'Talk_Passionately',
  'Talk_with_Right_Hand_Open',
  'Stand_Talking_Angry',
  'Wake_Up_and_Look_Up',
  'Stand_To_Side_Lying',
  'Swim_Forward',
] as const
export type CharacterClip = (typeof CHARACTER_CLIPS)[number]
/** Dock selection: 'auto' = behavior machine drives the clip (plan 025). */
export type ClipSelection = CharacterClip | 'auto'
export const DEFAULT_CLIP: CharacterClip = 'Walking'
/** World height of the placed character. The GLB ships at SOURCE scale
 *  (~1.62 — skinned meshes must not be scale-baked); the renderer divides
 *  this by CHARACTER_SOURCE_HEIGHT. Trees are 1.7 tall — a chick at 0.6
 *  reads as a small companion, not a kaiju. Tuning knob. */
export const CHARACTER_HEIGHT = 0.6
/** Bind-pose height of public/models/character.glb, guarded by
 *  test/objectGlbs.test.ts's "ships at source scale" test (1.5–1.8 band,
 *  measured via characterBindPoseBounds) — if that test moves, update this
 *  constant. Runtime cannot measure this with Box3: the asset is
 *  meshopt-quantized and skinned, so the dequantization correction lives
 *  inside the skin's inverse-bind matrices and raw geometry bounds are in
 *  quantized units (see characterBindPoseBounds in test/objectGlbs.test.ts). */
export const CHARACTER_SOURCE_HEIGHT = 1.62
