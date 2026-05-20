import type { OpenAIRealtimeMirrorEnv } from '~/agents/openai-realtime/config'
import {
  OPENAI_REALTIME_MIRROR_DEFAULT_MODEL,
  safetyIdentifierForStudent,
} from '~/agents/openai-realtime/config'
import {
  buildRealtimeMirrorCallSessionConfig,
  buildRealtimeMirrorInstructions,
  buildRealtimeMirrorSessionConfig,
} from '~/agents/openai-realtime/mirror-prompt'
import { requireCounselorContext } from '~/auth/identity'

export class OpenAIRealtimeMirrorSessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'OpenAIRealtimeMirrorSessionError'
  }
}

export interface OpenAIRealtimeMirrorSessionDeps {
  requireContext?: typeof requireCounselorContext
  fetch?: typeof fetch
  env?: OpenAIRealtimeMirrorEnv
  callsUrl?: string
}

const DEFAULT_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

export async function openAIRealtimeMirrorSessionHandler(
  request: Request,
  deps: OpenAIRealtimeMirrorSessionDeps = {},
): Promise<Response> {
  try {
    return await createRealtimeMirrorSession(request, deps)
  } catch (err) {
    if (err instanceof OpenAIRealtimeMirrorSessionError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    const message = err instanceof Error ? err.message : 'Could not create Realtime session.'
    return Response.json({ error: message }, { status: 500 })
  }
}

async function createRealtimeMirrorSession(
  request: Request,
  deps: OpenAIRealtimeMirrorSessionDeps,
): Promise<Response> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/sdp')) {
    throw new OpenAIRealtimeMirrorSessionError('Expected application/sdp offer.', 415)
  }

  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()
  const env = deps.env ?? process.env
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) {
    throw new OpenAIRealtimeMirrorSessionError('OPENAI_API_KEY is not set on the server.', 500)
  }

  const offer = await request.text()
  if (!offer.trim()) {
    throw new OpenAIRealtimeMirrorSessionError('SDP offer is empty.', 400)
  }

  const safetyIdentifier = safetyIdentifierForStudent(studentId)
  const model = env.OPENAI_REALTIME_MIRROR_MODEL || OPENAI_REALTIME_MIRROR_DEFAULT_MODEL
  const form = new FormData()
  form.set('sdp', offer)
  form.set('session', JSON.stringify(buildRealtimeMirrorCallSessionConfig({ model })))

  const upstream = await (deps.fetch ?? fetch)(deps.callsUrl ?? DEFAULT_CALLS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Safety-Identifier': safetyIdentifier,
    },
    body: form,
  })
  if (!upstream.ok) {
    throw new OpenAIRealtimeMirrorSessionError(
      `OpenAI Realtime session setup failed with status ${upstream.status}.`,
      502,
    )
  }

  return new Response(await upstream.text(), {
    status: 200,
    headers: {
      'Content-Type': 'application/sdp',
      'Cache-Control': 'no-store',
      'X-OpenAI-Realtime-Mirror': model,
    },
  })
}

export function buildOpenAIRealtimeMirrorSessionPreview(
  model = OPENAI_REALTIME_MIRROR_DEFAULT_MODEL,
) {
  return {
    model,
    instructions: buildRealtimeMirrorInstructions(),
    session: buildRealtimeMirrorSessionConfig({ model }),
  }
}
