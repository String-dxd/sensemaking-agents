// The companion prompt is extracted to a sibling .md file. Use Vite's
// `?raw` import so the body is inlined at build time as a string and
// works on both server (SSR) and client (WebRTC session). The prior
// `readFileSync` approach broke client bundles — this module is
// transitively imported by `realtime-mirror-client.ts` which runs in
// the browser, and `node:fs` is server-only.
import LIVE_PROMPT_RAW from './mirror-realtime-live.prompt.md?raw'

const MIRROR_JSON_SHAPE = '{"validation":"","inferred_meaning":"","story_reframe":""}'
export const OPENAI_REALTIME_MIRROR_VOICE = 'marin'
export const OPENAI_REALTIME_MIRROR_TRANSCRIPTION_LANGUAGE = 'en'
export const OPENAI_REALTIME_MIRROR_TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe'

const LIVE_INSTRUCTIONS = LIVE_PROMPT_RAW.trim()

export function buildRealtimeMirrorLiveInstructions(): string {
  return LIVE_INSTRUCTIONS
}

export function buildRealtimeMirrorLiveAudioInputConfig() {
  return {
    transcription: {
      model: OPENAI_REALTIME_MIRROR_TRANSCRIPTION_MODEL,
      language: OPENAI_REALTIME_MIRROR_TRANSCRIPTION_LANGUAGE,
    },
    noise_reduction: { type: 'far_field' },
    turn_detection: {
      type: 'server_vad',
      create_response: false,
      interrupt_response: true,
      threshold: 0.5,
      prefix_padding_ms: 700,
      silence_duration_ms: 800,
    },
  } as const
}

export function buildRealtimeMirrorLiveResponseInstructions(): string {
  return [
    buildRealtimeMirrorLiveInstructions(),
    '',
    'The student has just finished one English voice turn.',
    'Reply in English only.',
    'Keep this spoken reply short and natural.',
  ].join('\n')
}

export function buildRealtimeMirrorUserInput(transcript: string): string {
  return [
    'The student had this live voice session with the Companion while looking into the mirror scene.',
    'Mirror and summarise the student-side session in the three Mirror fields.',
    'Use the transcript as evidence. Do not include Companion replies unless the student repeated them.',
    'Return only JSON in this exact shape:',
    MIRROR_JSON_SHAPE,
    '',
    'Student-side session transcript:',
    transcript,
  ].join('\n')
}

export function buildRealtimeMirrorRepairInput(previousText: string): string {
  return [
    'The previous response was not valid Mirror JSON.',
    'Convert it into exactly this JSON shape and return only JSON:',
    MIRROR_JSON_SHAPE,
    '',
    'Previous response:',
    previousText,
  ].join('\n')
}

export function buildRealtimeMirrorResponseInstructions(): string {
  return [
    'Use the latest student transcript item in this conversation.',
    'Write every field in English.',
    'Return ONLY a JSON object with validation, inferred_meaning, and story_reframe.',
    `The object must match this shape: ${MIRROR_JSON_SHAPE}.`,
    'Do not ask a question. Do not give advice. Do not include Markdown.',
  ].join(' ')
}
