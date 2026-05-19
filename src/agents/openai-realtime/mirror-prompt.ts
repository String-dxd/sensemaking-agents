import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RealtimeSessionCreateRequest } from 'openai/resources/realtime/realtime'
import { OPENAI_REALTIME_MIRROR_DEFAULT_MODEL } from './config'
import {
  buildRealtimeMirrorLiveInstructions,
  OPENAI_REALTIME_MIRROR_VOICE,
} from './mirror-payloads'

export {
  buildRealtimeMirrorLiveInstructions,
  buildRealtimeMirrorRepairInput,
  buildRealtimeMirrorResponseInstructions,
  buildRealtimeMirrorUserInput,
  OPENAI_REALTIME_MIRROR_VOICE,
} from './mirror-payloads'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROMPT_PATH = resolve(__dirname, '..', 'mirror.prompt.md')

let cachedMirrorPrompt: string | null = null

export function getMirrorSystemPrompt(): string {
  cachedMirrorPrompt ??= readFileSync(PROMPT_PATH, 'utf8').trim()
  return cachedMirrorPrompt
}

export function buildRealtimeMirrorInstructions(): string {
  return [
    getMirrorSystemPrompt(),
    '',
    '## Realtime session rules',
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
      input: {
        transcription: {
          model: 'gpt-4o-mini-transcribe',
          language: 'en',
        },
        noise_reduction: { type: 'near_field' },
        turn_detection:
          mode === 'live_audio'
            ? {
                type: 'semantic_vad',
                create_response: true,
                interrupt_response: true,
                eagerness: 'auto',
              }
            : null,
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
