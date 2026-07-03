import { Bloom, EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'

// Post stack (plan 005, step 4). Exactly three fullscreen passes — the plan
// 000 §9 budget: N8AO (soft contact grounding, not gritty realism), Bloom
// (high threshold, only catches highlights/catchlights), SMAA. ACES filmic
// tone mapping stays on the renderer (r3f default).
//
// `?fx=0` disables the composer entirely (perf A/B) — handled by the caller
// (Stage) so this component stays declarative.

export function PostFX() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO quality="performance" aoRadius={0.4} intensity={1.5} distanceFalloff={0.4} />
      <Bloom mipmapBlur luminanceThreshold={0.95} luminanceSmoothing={0.1} intensity={0.35} />
      <SMAA />
    </EffectComposer>
  )
}
