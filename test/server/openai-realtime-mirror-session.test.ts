import { describe, expect, it, vi } from 'vitest'
import { openAIRealtimeMirrorSessionHandler } from '~/server/openai-realtime-mirror-session.handler.server'

describe('openAIRealtimeMirrorSessionHandler', () => {
  it('proxies an authenticated SDP offer to OpenAI with server-built session config', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return new Response('answer-sdp', { status: 200 })
    })

    const response = await openAIRealtimeMirrorSessionHandler(
      new Request('https://app.test/api/openai/realtime-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: 'offer-sdp',
      }),
      {
        requireContext: vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo' })),
        env: { OPENAI_API_KEY: 'sk-test' },
        fetch: fetchImpl as typeof fetch,
        callsUrl: 'https://api.openai.test/v1/realtime/calls',
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/sdp')
    expect(await response.text()).toBe('answer-sdp')
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.test/v1/realtime/calls',
      expect.objectContaining({ method: 'POST' }),
    )
    const forwardedInit = fetchImpl.mock.calls[0]?.[1]
    const forwardedHeaders = forwardedInit?.headers as Record<string, string>
    const forwardedBody = forwardedInit?.body as FormData
    expect((forwardedHeaders as Record<string, string>).Authorization).toBe('Bearer sk-test')
    expect((forwardedHeaders as Record<string, string>)['OpenAI-Safety-Identifier']).toMatch(
      /^[a-f0-9]{64}$/,
    )
    expect(forwardedBody?.get('sdp')).toBe('offer-sdp')
    const session = JSON.parse(String(forwardedBody?.get('session'))) as {
      type: string
      model: string
      output_modalities: string[]
      audio: {
        input: {
          transcription: { model: string }
          turn_detection: { type: string; eagerness: string; create_response: boolean }
        }
        output: { voice: string }
      }
    }
    expect(session).toMatchObject({
      type: 'realtime',
      model: 'gpt-realtime-2',
      output_modalities: ['audio'],
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
          turn_detection: {
            type: 'semantic_vad',
            create_response: true,
            interrupt_response: true,
            eagerness: 'auto',
          },
        },
        output: {
          voice: 'marin',
        },
      },
    })
  })

  it('authenticates before calling OpenAI', async () => {
    const fetchImpl = vi.fn()

    const response = await openAIRealtimeMirrorSessionHandler(
      new Request('https://app.test/api/openai/realtime-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: 'offer-sdp',
      }),
      {
        requireContext: vi.fn(async () => {
          throw new Error('not signed in')
        }),
        env: { OPENAI_API_KEY: 'sk-test', OPENAI_REALTIME_MIRROR_MODEL: 'gpt-realtime' },
        fetch: fetchImpl as typeof fetch,
      },
    )

    expect(response.status).toBe(500)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns a display-safe error when upstream setup fails', async () => {
    const response = await openAIRealtimeMirrorSessionHandler(
      new Request('https://app.test/api/openai/realtime-mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: 'offer-sdp',
      }),
      {
        requireContext: vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo' })),
        env: { OPENAI_API_KEY: 'sk-test', OPENAI_REALTIME_MIRROR_MODEL: 'gpt-realtime' },
        fetch: vi.fn(
          async () => new Response('secret upstream details', { status: 401 }),
        ) as typeof fetch,
      },
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: 'OpenAI Realtime session setup failed with status 401.',
    })
  })
})
