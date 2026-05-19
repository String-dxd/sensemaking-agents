import { createHash } from 'node:crypto'

export const OPENAI_REALTIME_MIRROR_DEFAULT_MODEL = 'gpt-realtime-2'
export const OPENAI_REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

export class OpenAIRealtimeConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenAIRealtimeConfigError'
  }
}

export interface OpenAIRealtimeMirrorConfig {
  apiKey: string
  model: string
  callsUrl: string
}

export interface OpenAIRealtimeMirrorEnv {
  OPENAI_API_KEY?: string
  OPENAI_REALTIME_MIRROR_MODEL?: string
}

export function getOpenAIRealtimeMirrorConfig(
  env: OpenAIRealtimeMirrorEnv = process.env,
): OpenAIRealtimeMirrorConfig {
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) {
    throw new OpenAIRealtimeConfigError('OPENAI_API_KEY is not set on the server.')
  }
  return {
    apiKey,
    model: env.OPENAI_REALTIME_MIRROR_MODEL || OPENAI_REALTIME_MIRROR_DEFAULT_MODEL,
    callsUrl: OPENAI_REALTIME_CALLS_URL,
  }
}

export function safetyIdentifierForStudent(studentId: string): string {
  return createHash('sha256').update(`student-space:${studentId}`).digest('hex')
}
