// @sensemaking/companion-runtime — load + play a compiled .companion.glb in
// the product web app. Three-version-agnostic (peer dep three >= 0.149); the
// host injects its own three namespace + owns GLTF loading and decoders.
//
// Quick start (see docs/companion-handoff.md for decoder setup):
//   import * as THREE from 'three'
//   import { loadCompanion } from '@sensemaking/companion-runtime'
//   const gltf = await loader.parseAsync(bytes)      // host's GLTFLoader
//   const companion = loadCompanion(gltf, THREE)
//   // per frame: companion.update(dt)
//   companion.setState('walk'); companion.setExpression('happy')

export { loadCompanion } from './loadCompanion'
export type { Companion, LoadCompanionOptions, ToonMaterialFactory } from './loadCompanion'
export {
  parseSenCompanion,
  readSenCompanion,
  SEN_COMPANION_EXT_VERSION,
  SEN_COMPANION_EXTENSION_NAME,
  SenCompanionSchema,
} from './senCompanion'
export type {
  ColliderGroup,
  SenCompanionData,
  SphereCollider,
  SpringChainDef,
  SpringJointParams,
} from './senCompanion'
export type { GestureName, MachineState } from './clipStateMachine'
export type { AmplitudeSource } from './talkDriver'
export { makeSpeechSynthAmplitude } from './talkDriver'
export { mulberry32 } from './noise'
export type { LoadedGLTF, Object3DLike, ThreeNamespace } from './three-types'

// Lower-level pieces (host-optional / advanced): the ported solver + layers.
export { createSpringRig, createFixedStepper } from './springSolver'
export type { SpringRig } from './springSolver'
export { createFaceControl } from './faceControl'
export type { FaceControl } from './faceControl'
