import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIRROR_JSON_SHAPE = '{"validation":"","inferred_meaning":"","story_reframe":""}'
export const OPENAI_REALTIME_MIRROR_VOICE = 'marin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const LIVE_PROMPT_PATH = resolve(__dirname, 'mirror-realtime-live.prompt.md')

let cachedLiveInstructions: string | null = null

export function buildRealtimeMirrorLiveInstructions(): string {
  cachedLiveInstructions ??= readFileSync(LIVE_PROMPT_PATH, 'utf8').trim()
  return cachedLiveInstructions
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
    'Return ONLY a JSON object with validation, inferred_meaning, and story_reframe.',
    `The object must match this shape: ${MIRROR_JSON_SHAPE}.`,
    'Do not ask a question. Do not give advice. Do not include Markdown.',
  ].join(' ')
}
