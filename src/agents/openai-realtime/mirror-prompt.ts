import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime'
import MIRROR_PROMPT_RAW from '../mirror.prompt.md?raw'
import { OPENAI_REALTIME_MIRROR_DEFAULT_MODEL } from './config'
import {
  buildRealtimeMirrorLiveAudioInputConfig,
  buildRealtimeMirrorLiveInstructions,
  OPENAI_REALTIME_MIRROR_TRANSCRIPTION_LANGUAGE,
  OPENAI_REALTIME_MIRROR_TRANSCRIPTION_MODEL,
  OPENAI_REALTIME_MIRROR_VOICE,
} from './mirror-payloads'

export {
  buildRealtimeMirrorLiveAudioInputConfig,
  buildRealtimeMirrorLiveInstructions,
  buildRealtimeMirrorRepairInput,
  buildRealtimeMirrorResponseInstructions,
  buildRealtimeMirrorUserInput,
  OPENAI_REALTIME_MIRROR_TRANSCRIPTION_LANGUAGE,
  OPENAI_REALTIME_MIRROR_TRANSCRIPTION_MODEL,
  OPENAI_REALTIME_MIRROR_VOICE,
} from './mirror-payloads'

const MIRROR_PROMPT = MIRROR_PROMPT_RAW.trim()

export function getMirrorSystemPrompt(): string {
  return MIRROR_PROMPT
}

export function buildRealtimeMirrorInstructions(): string {
  return [
    getMirrorSystemPrompt(),
    '',
    '## Realtime session rules',
    '- Always write the final Mirror JSON fields in English.',
    '- The student is not in an interview. Do not ask questions.',
    '- For voice input, listen until the app sends the explicit stop/commit event.',
    '- Return text only.',
    '- Return ONLY a JSON object with exactly these keys: validation, inferred_meaning, story_reframe.',
    '- Do not wrap the JSON in Markdown fences.',
  ].join('\n')
}

export function buildRealtimeMirrorSessionConfig({
  model = OPENAI_REALTIME_MIRROR_DEFAULT_MODEL,
  mode = 'json',
  safetyIdentifier,
  voice = OPENAI_REALTIME_MIRROR_VOICE,
}: {
  model?: string
  mode?: 'json' | 'live_audio'
  safetyIdentifier?: string
  voice?: string
} = {}): RealtimeSessionCreateRequest {
  return {
    type: 'realtime',
    model,
    instructions:
      mode === 'live_audio'
        ? buildRealtimeMirrorLiveInstructions()
        : buildRealtimeMirrorInstructions(),
    output_modalities: [mode === 'live_audio' ? 'audio' : 'text'],
    max_output_tokens: 1000,
    audio: {
      input:
        mode === 'live_audio'
          ? buildRealtimeMirrorLiveAudioInputConfig()
          : {
              transcription: {
                model: OPENAI_REALTIME_MIRROR_TRANSCRIPTION_MODEL,
                language: OPENAI_REALTIME_MIRROR_TRANSCRIPTION_LANGUAGE,
              },
              noise_reduction: { type: 'far_field' },
              turn_detection: null,
            },
      ...(mode === 'live_audio' ? { output: { voice } } : {}),
    },
    tool_choice: 'none',
    tools: [],
    tracing: safetyIdentifier
      ? {
          workflow_name: 'student-space-mirror',
          group_id: safetyIdentifier,
          metadata: {
            agent: 'mirror',
            provider: 'openai_realtime',
          },
        }
      : null,
  }
}

// Full live-audio config at call creation so transcription, VAD, and
// instructions are active the moment the WebRTC connection comes up —
// not only after the data channel opens and the client sends
// `session.update`. The client update stays as an idempotent re-assert.
export function buildRealtimeMirrorCallSessionConfig({
  model = OPENAI_REALTIME_MIRROR_DEFAULT_MODEL,
  voice = OPENAI_REALTIME_MIRROR_VOICE,
  safetyIdentifier,
}: {
  model?: string
  voice?: string
  safetyIdentifier?: string
} = {}): RealtimeSessionCreateRequest {
  return buildRealtimeMirrorSessionConfig({ model, mode: 'live_audio', voice, safetyIdentifier })
}
