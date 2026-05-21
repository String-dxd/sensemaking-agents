import { describe, expect, it, vi } from 'vitest'
import {
  createRealtimeMirrorAccumulator,
  createRealtimeMirrorCapture,
} from '~/lib/student-space/realtime-mirror-client'

describe('realtime-mirror-client', () => {
  it('opens a live WebRTC session, plays remote audio, and requests final Mirror JSON on stop', async () => {
    const track = { stop: vi.fn(), kind: 'audio' }
    const remoteStream = { id: 'remote-stream' } as unknown as MediaStream
    const stream = {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream
    const getUserMedia = vi.fn(async () => stream)
    const channel = new FakeDataChannel()
    const peer = new FakePeerConnection(channel)
    const PeerCtor = vi.fn(() => peer)
    const audio = new FakeAudioElement()
    let forwardedOffer: string | undefined
    const conversationUpdates: Array<{
      id: string
      role: 'student' | 'kira'
      text: string
      status: 'streaming' | 'final'
    }> = []
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      forwardedOffer = String(init?.body)
      return new Response('answer-sdp', { status: 200 })
    })

    const capture = await createRealtimeMirrorCapture(
      {
        localCaptureId: 'ask-realtime',
        contextType: 'school',
        mood: 'joy',
        onConversationUpdate: (update) => conversationUpdates.push(update),
      },
      {
        fetch: fetchImpl as typeof fetch,
        mediaDevices: { getUserMedia },
        RTCPeerConnection: PeerCtor as unknown as typeof RTCPeerConnection,
        endpoint: '/api/openai/realtime-mirror',
        createAudioElement: () => audio as unknown as HTMLAudioElement,
      },
    )

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
    expect(peer.addedTracks).toEqual([track])
    expect(forwardedOffer).toBe('offer-sdp')
    expect(peer.remoteDescription).toEqual({ type: 'answer', sdp: 'answer-sdp' })
    peer.emitTrack(remoteStream)
    expect(audio.srcObject).toBe(remoteStream)
    expect(audio.play).toHaveBeenCalled()

    const stopPromise = capture.stop()
    channel.open()
    await Promise.resolve()
    expect(channel.sent.map((payload) => JSON.parse(payload).type)).toEqual(['session.update'])
    const sessionUpdate = JSON.parse(channel.sent[0] ?? '{}').session
    expect(sessionUpdate).toMatchObject({
      type: 'realtime',
      output_modalities: ['audio'],
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' },
          turn_detection: {
            type: 'semantic_vad',
            create_response: true,
            interrupt_response: true,
          },
        },
      },
    })
    channel.message({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'student-1',
      transcript: 'I said this live.',
    })
    channel.message({
      type: 'response.output_audio_transcript.delta',
      response_id: 'kira-live-1',
      delta: 'I hear ',
    })
    channel.message({
      type: 'response.output_audio_transcript.done',
      response_id: 'kira-live-1',
      transcript: 'I hear you.',
    })
    await Promise.resolve()
    expect(conversationUpdates).toEqual([
      {
        id: 'student-1',
        role: 'student',
        text: 'I said this live.',
        status: 'final',
      },
      {
        id: 'kira-live-1',
        role: 'kira',
        text: 'I hear',
        status: 'streaming',
      },
      {
        id: 'kira-live-1',
        role: 'kira',
        text: 'I hear you.',
        status: 'final',
      },
    ])
    await Promise.resolve()
    await Promise.resolve()
    expect(channel.sent.map((payload) => JSON.parse(payload).type)).toEqual([
      'session.update',
      'response.create',
    ])
    const responseCreatePayload = channel.sent[1]
    expect(responseCreatePayload).toBeDefined()
    if (!responseCreatePayload) throw new Error('Realtime response was not requested.')
    const responseCreate = JSON.parse(responseCreatePayload).response
    expect(responseCreate.conversation).toBe('none')
    expect(responseCreate.output_modalities).toEqual(['text'])
    expect(responseCreate.metadata.purpose).toBe('mirror_final_json')
    expect(responseCreate.input[0].content[0].text).toContain('live voice session with Kira')
    expect(responseCreate.input[0].content[0].text).toContain('I said this live.')
    channel.message({
      type: 'response.created',
      response: { id: 'final-response', metadata: { purpose: 'mirror_final_json' } },
    })
    channel.message({
      type: 'response.output_text.done',
      response_id: 'final-response',
      text: JSON.stringify({
        validation: 'That was live.',
        inferred_meaning: 'Maybe the live path mattered.',
        story_reframe: 'You said it in the scene. Kira held it there.',
      }),
    })
    channel.message({
      type: 'response.done',
      response: { id: 'final-response', status: 'completed' },
    })

    await expect(stopPromise).resolves.toMatchObject({
      localCaptureId: 'ask-realtime',
      transcript: 'I said this live.',
      validation: 'That was live.',
      inferredMeaning: 'Maybe the live path mattered.',
      storyReframe: 'You said it in the scene. Kira held it there.',
      contextType: 'school',
      mood: 'joy',
      transcription: { provider: 'openai_realtime', transcript: 'I said this live.' },
    })
    expect(track.stop).toHaveBeenCalled()
    expect(audio.pause).toHaveBeenCalled()
    expect(audio.removed).toBe(true)
    expect(channel.closed).toBe(true)
    expect(peer.closed).toBe(true)
  })

  it('parses fenced Mirror JSON from Realtime events', async () => {
    const accumulator = createRealtimeMirrorAccumulator({
      localCaptureId: 'ask-json',
      contextType: 'school',
      initialTranscript: 'typed first',
    })
    accumulator.expectJsonResponse()

    accumulator.accept({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'then spoken',
    })
    accumulator.accept({
      type: 'response.output_text.done',
      text: '```json\n{"validation":"v","inferred_meaning":"m","story_reframe":"s"}\n```',
    })
    accumulator.accept({ type: 'response.done', response: { status: 'completed' } })

    await expect(accumulator.result).resolves.toMatchObject({
      transcript: 'typed first then spoken',
      validation: 'v',
      inferredMeaning: 'm',
      storyReframe: 's',
    })
  })

  it('summarizes multiple student turns without duplicating partial deltas', async () => {
    const accumulator = createRealtimeMirrorAccumulator({
      localCaptureId: 'ask-multi-turn',
      contextType: 'school',
      initialTranscript: 'typed preface',
    })
    accumulator.expectJsonResponse()

    accumulator.accept({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'student-turn-1',
      delta: 'First ',
    })
    accumulator.accept({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'student-turn-1',
      delta: 'turn',
    })
    accumulator.accept({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'student-turn-1',
      transcript: 'First turn',
    })
    accumulator.accept({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'student-turn-2',
      transcript: 'Second turn after Kira answered.',
    })

    expect(accumulator.currentTranscript()).toBe(
      'typed preface First turn Second turn after Kira answered.',
    )

    accumulator.accept({
      type: 'response.output_text.done',
      text: '{"validation":"v","inferred_meaning":"m","story_reframe":"s"}',
    })
    accumulator.accept({ type: 'response.done', response: { status: 'completed' } })

    await expect(accumulator.result).resolves.toMatchObject({
      transcript: 'typed preface First turn Second turn after Kira answered.',
      validation: 'v',
      inferredMeaning: 'm',
      storyReframe: 's',
    })
  })

  it('asks Realtime to repair one prose response before failing the capture', async () => {
    const repairRequests: Array<{ previousText: string; transcript: string }> = []
    const accumulator = createRealtimeMirrorAccumulator(
      {
        localCaptureId: 'ask-repair',
        contextType: 'school',
      },
      {
        onRepairNeeded: (previousText, transcript) =>
          repairRequests.push({ previousText, transcript }),
      },
    )
    accumulator.expectJsonResponse()

    accumulator.accept({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Voice reflection',
    })
    accumulator.accept({
      type: 'response.output_text.done',
      text: 'I hear you. That sounds meaningful.',
    })
    accumulator.accept({ type: 'response.done', response: { status: 'completed' } })

    expect(repairRequests).toEqual([
      {
        previousText: 'I hear you. That sounds meaningful.',
        transcript: 'Voice reflection',
      },
    ])

    accumulator.accept({
      type: 'response.output_text.done',
      text: '{"validation":"v","inferred_meaning":"m","story_reframe":"s"}',
    })
    accumulator.accept({ type: 'response.done', response: { status: 'completed' } })

    await expect(accumulator.result).resolves.toMatchObject({
      transcript: 'Voice reflection',
      validation: 'v',
      inferredMeaning: 'm',
      storyReframe: 's',
    })
  })

  it('ignores live spoken replies until the final JSON response is requested', async () => {
    const accumulator = createRealtimeMirrorAccumulator({
      localCaptureId: 'ask-live',
      contextType: 'school',
    })

    accumulator.accept({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'I am thinking out loud.',
    })
    accumulator.accept({
      type: 'response.created',
      response: { id: 'live-response', metadata: { source: 'openai-auto-turn' } },
    })
    accumulator.accept({
      type: 'response.output_audio_transcript.done',
      response_id: 'live-response',
      transcript: 'I hear that this is still forming.',
    })
    accumulator.accept({
      type: 'response.done',
      response: { id: 'live-response', status: 'completed' },
    })

    accumulator.expectJsonResponse()
    accumulator.accept({
      type: 'response.created',
      response: { id: 'final-response', metadata: { purpose: 'mirror_final_json' } },
    })
    accumulator.accept({
      type: 'response.output_text.done',
      response_id: 'final-response',
      text: '{"validation":"v","inferred_meaning":"m","story_reframe":"s"}',
    })
    accumulator.accept({
      type: 'response.done',
      response: { id: 'final-response', status: 'completed' },
    })

    await expect(accumulator.result).resolves.toMatchObject({
      transcript: 'I am thinking out loud.',
      validation: 'v',
      inferredMeaning: 'm',
      storyReframe: 's',
    })
  })

  it('does not time out a long live conversation before final JSON is requested', async () => {
    vi.useFakeTimers()
    try {
      const accumulator = createRealtimeMirrorAccumulator(
        {
          localCaptureId: 'ask-long-live',
          contextType: 'school',
        },
        30_000,
      )

      accumulator.accept({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'student-1',
        transcript: 'I talked with Kira for a while before stopping.',
      })
      await vi.advanceTimersByTimeAsync(45_000)

      accumulator.expectJsonResponse()
      accumulator.accept({
        type: 'response.created',
        response: { id: 'final-response', metadata: { purpose: 'mirror_final_json' } },
      })
      accumulator.accept({
        type: 'response.output_text.done',
        response_id: 'final-response',
        text: '{"validation":"v","inferred_meaning":"m","story_reframe":"s"}',
      })
      accumulator.accept({
        type: 'response.done',
        response: { id: 'final-response', status: 'completed' },
      })

      await expect(accumulator.result).resolves.toMatchObject({
        transcript: 'I talked with Kira for a while before stopping.',
        validation: 'v',
        inferredMeaning: 'm',
        storyReframe: 's',
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

class FakeDataChannel {
  readyState: RTCDataChannelState = 'connecting'
  sent: string[] = []
  closed = false
  private listeners = new Map<string, Set<(event: Event | MessageEvent) => void>>()

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener as (event: Event | MessageEvent) => void)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener as (event: Event | MessageEvent) => void)
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.closed = true
  }

  open() {
    this.readyState = 'open'
    this.emit('open', new Event('open'))
  }

  message(payload: Record<string, unknown>) {
    this.emit('message', { data: JSON.stringify(payload) } as MessageEvent)
  }

  private emit(type: string, event: Event | MessageEvent) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

class FakePeerConnection {
  addedTracks: unknown[] = []
  remoteDescription: RTCSessionDescriptionInit | null = null
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  closed = false

  constructor(private channel: FakeDataChannel) {}

  addTrack(track: unknown) {
    this.addedTracks.push(track)
  }

  createDataChannel() {
    return this.channel
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'offer-sdp' }
  }

  async setLocalDescription() {}

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description
  }

  emitTrack(stream: MediaStream) {
    this.ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent)
  }

  close() {
    this.closed = true
  }
}

class FakeAudioElement {
  autoplay = false
  playsInline = false
  style = { display: '' }
  parentElement = null
  srcObject: MediaProvider | null = null
  play = vi.fn(async () => {})
  pause = vi.fn()
  removed = false

  remove() {
    this.removed = true
  }
}
