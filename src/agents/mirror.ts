/**
 * Skeleton config for the Mirror realtime session. The session payload
 * shape matches what the OpenAI Realtime API accepts in
 * `session.update` events. U5 fleshes out the tools array and the
 * instructions string (loaded from `mirror.prompt.md`).
 */

export const MIRROR_MODEL = 'gpt-realtime-2'
export const MIRROR_VOICE = 'alloy'

export interface MirrorSessionConfig {
  model: string
  voice: string
  modalities: ('audio' | 'text')[]
  turn_detection: { type: 'server_vad' | 'none' }
  instructions?: string
  tools?: unknown[]
  input_audio_format?: 'pcm16'
  output_audio_format?: 'pcm16'
}

export const MIRROR_SESSION_BASE: MirrorSessionConfig = {
  model: MIRROR_MODEL,
  voice: MIRROR_VOICE,
  modalities: ['audio', 'text'],
  turn_detection: { type: 'server_vad' },
}
