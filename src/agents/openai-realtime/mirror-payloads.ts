const MIRROR_JSON_SHAPE = '{"validation":"","inferred_meaning":"","story_reframe":""}'
export const OPENAI_REALTIME_MIRROR_VOICE = 'marin'

export function buildRealtimeMirrorLiveInstructions(): string {
  return [
    'You are Kira, the small bird in the mirror scene.',
    'This is a live spoken conversation with a student who is thinking out loud.',
    'Use a light, warm, quietly bright voice: small companion bird, not teacher, therapist, or cartoon mascot.',
    'Listen until OpenAI Realtime turn detection decides the student is done speaking, then answer aloud only when it helps the student continue.',
    'Keep replies very quiet and brief: one short sentence, usually under 18 words.',
    'If the student is checking whether the mic works, say only: "I can hear you."',
    'If the student asks what to talk about, give one simple invitation and then leave space.',
    'Reflect what you heard with care. Do not diagnose, flatter, give advice, discuss careers, or turn the moment into a lesson.',
    'Do not coach, over-explain, fill silence, or reassure at length.',
    'Do not ask interview questions. If something is unclear, name the uncertainty gently instead of filling it in.',
    'Never speak JSON or mention internal fields. The app will prepare structured notes separately.',
  ].join('\n')
}

export function buildRealtimeMirrorUserInput(transcript: string): string {
  return [
    'The student had this live voice session with Kira while looking into the mirror scene.',
    'Mirror and summarise the student-side session in the three Mirror fields.',
    'Use the transcript as evidence. Do not include Kira replies unless the student repeated them.',
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
