import {
  buildRealtimeMirrorLiveInstructions,
  buildRealtimeMirrorRepairInput,
  buildRealtimeMirrorResponseInstructions,
  buildRealtimeMirrorUserInput,
  OPENAI_REALTIME_MIRROR_VOICE,
} from '~/agents/openai-realtime/mirror-payloads'
import { parseMirrorRealtimeText } from '~/agents/openai-realtime/parse'
import type { Mood, VipsContextType } from '~/agents/tools/schemas'

export interface StudentSpaceRealtimeConversationUpdate {
  id: string
  role: 'student' | 'kira'
  text: string
  status: 'streaming' | 'final'
}

export interface StudentSpaceRealtimeMirrorInput {
  localCaptureId: string
  contextType?: VipsContextType
  mood?: Mood | null
  initialTranscript?: string
  onConversationUpdate?: (update: StudentSpaceRealtimeConversationUpdate) => void
}

export interface StudentSpaceRealtimePreparedReflection {
  localCaptureId: string
  transcript: string
  validation: string
  inferredMeaning: string
  storyReframe: string
  contextType: VipsContextType
  mood?: Mood | null
  evalReview?: null
  transcription?: {
    provider: 'openai_realtime'
    transcript: string
  }
}

export interface StudentSpaceRealtimeMirrorCapture {
  stop: () => Promise<StudentSpaceRealtimePreparedReflection>
  abort: () => void
}

export interface RealtimeMirrorClientDeps {
  fetch?: typeof fetch
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>
  RTCPeerConnection?: typeof RTCPeerConnection
  endpoint?: string
  resultTimeoutMs?: number
  createAudioElement?: () => HTMLAudioElement
}

interface RealtimeMirrorAccumulatorOptions {
  timeoutMs?: number
  maxRepairAttempts?: number
  onRepairNeeded?: (previousText: string, transcript: string) => void
  onConversationUpdate?: (update: StudentSpaceRealtimeConversationUpdate) => void
}

type MinimalDataChannel = Pick<
  RTCDataChannel,
  'addEventListener' | 'removeEventListener' | 'close' | 'readyState' | 'send'
>

type MinimalPeerConnection = Pick<
  RTCPeerConnection,
  | 'addTrack'
  | 'close'
  | 'createDataChannel'
  | 'createOffer'
  | 'ontrack'
  | 'setLocalDescription'
  | 'setRemoteDescription'
>

const DEFAULT_ENDPOINT = '/api/openai/realtime-mirror'
const DEFAULT_RESULT_TIMEOUT_MS = 30_000

export function canCreateRealtimeMirrorCapture(): boolean {
  return Boolean(
    typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof RTCPeerConnection !== 'undefined',
  )
}

export async function createRealtimeMirrorCapture(
  input: StudentSpaceRealtimeMirrorInput,
  deps: RealtimeMirrorClientDeps = {},
): Promise<StudentSpaceRealtimeMirrorCapture> {
  const mediaDevices = deps.mediaDevices ?? navigator.mediaDevices
  const PeerConnection =
    deps.RTCPeerConnection ??
    (globalThis as typeof globalThis & { RTCPeerConnection?: typeof RTCPeerConnection })
      .RTCPeerConnection
  if (!mediaDevices?.getUserMedia || !PeerConnection) {
    throw new Error('Realtime voice is not available in this browser.')
  }

  const stream = await mediaDevices.getUserMedia({ audio: true })
  const peer = new PeerConnection() as MinimalPeerConnection
  const remoteAudio = createRemoteAudioOutput(deps.createAudioElement)
  peer.ontrack = (event) => remoteAudio.attach(event)
  for (const track of stream.getAudioTracks()) {
    peer.addTrack(track, stream)
  }
  const dataChannel = peer.createDataChannel('oai-events') as MinimalDataChannel
  const accumulator = createRealtimeMirrorAccumulator(input, {
    timeoutMs: deps.resultTimeoutMs,
    onConversationUpdate: input.onConversationUpdate,
    onRepairNeeded: (previousText) => {
      accumulator.expectJsonResponse()
      sendRealtimeMirrorResponse(dataChannel, buildRealtimeMirrorRepairInput(previousText), {
        modality: 'text',
        purpose: 'mirror_repair_json',
      })
    },
  })
  const onMessage = (event: MessageEvent) => {
    try {
      const data = typeof event.data === 'string' ? event.data : String(event.data)
      accumulator.accept(JSON.parse(data))
    } catch (err) {
      accumulator.fail(err instanceof Error ? err : new Error(String(err)))
    }
  }
  const onChannelError = () => accumulator.fail(new Error('Realtime voice channel failed.'))
  dataChannel.addEventListener('message', onMessage)
  dataChannel.addEventListener('error', onChannelError)

  let sessionReady: Promise<void> = Promise.resolve()
  try {
    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    const offerSdp = offer.sdp
    if (!offerSdp) throw new Error('Could not create a Realtime voice offer.')
    const response = await (deps.fetch ?? fetch)(deps.endpoint ?? DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: offerSdp,
    })
    if (!response.ok) {
      throw new Error(await displaySafeRealtimeSetupError(response))
    }
    await peer.setRemoteDescription({
      type: 'answer',
      sdp: await response.text(),
    })
    sessionReady = sendRealtimeMirrorLiveSessionUpdateWhenOpen(dataChannel).catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err))
      accumulator.fail(error)
      throw error
    })
  } catch (err) {
    teardownRealtimeCapture(peer, dataChannel, stream, remoteAudio)
    throw err
  }

  let stopStarted = false
  return {
    stop: async () => {
      if (stopStarted) return accumulator.result
      stopStarted = true
      await sessionReady
      stopStreamTracks(stream)
      try {
        const transcript =
          accumulator.currentTranscript() ||
          (await waitForRealtimeTranscript(
            accumulator.transcript,
            deps.resultTimeoutMs ?? DEFAULT_RESULT_TIMEOUT_MS,
          ))
        accumulator.expectJsonResponse()
        sendRealtimeMirrorResponse(dataChannel, buildRealtimeMirrorUserInput(transcript), {
          modality: 'text',
          purpose: 'mirror_final_json',
        })
        return await accumulator.result
      } catch (err) {
        accumulator.fail(err instanceof Error ? err : new Error(String(err)))
        throw err
      } finally {
        teardownRealtimeCapture(peer, dataChannel, stream, remoteAudio)
      }
    },
    abort: () => {
      accumulator.fail(new Error('Realtime voice capture was cancelled.'))
      teardownRealtimeCapture(peer, dataChannel, stream, remoteAudio)
    },
  }
}

export function createRealtimeMirrorAccumulator(
  input: StudentSpaceRealtimeMirrorInput,
  options: number | RealtimeMirrorAccumulatorOptions = DEFAULT_RESULT_TIMEOUT_MS,
): {
  result: Promise<StudentSpaceRealtimePreparedReflection>
  transcript: Promise<string>
  currentTranscript: () => string
  expectJsonResponse: () => void
  accept: (event: Record<string, unknown>) => void
  fail: (error: Error) => void
} {
  const { timeoutMs, maxRepairAttempts, onRepairNeeded, onConversationUpdate } =
    normalizeAccumulatorOptions(options)
  const transcriptParts = new Map<string, string>()
  const transcriptOrder: string[] = []
  const assistantParts = new Map<string, string>()
  let finalText = ''
  let responseDone = false
  let repairAttempts = 0
  let acceptUnidentifiedJsonResponse = false
  let fallbackTranscriptId: string | null = null
  let fallbackTranscriptIndex = 0
  const jsonResponseIds = new Set<string>()
  let settle: (value: StudentSpaceRealtimePreparedReflection) => void
  let reject: (reason?: unknown) => void
  let settleTranscript: (value: string) => void
  let rejectTranscript: (reason?: unknown) => void
  let transcriptSettled = false
  let settled = false
  let resultTimer: ReturnType<typeof setTimeout> | null = null
  const result = new Promise<StudentSpaceRealtimePreparedReflection>((resolve, rejectPromise) => {
    settle = resolve
    reject = rejectPromise
  })
  const transcriptResult = new Promise<string>((resolve, rejectPromise) => {
    settleTranscript = resolve
    rejectTranscript = rejectPromise
  })

  const fail = (error: Error) => {
    if (settled) return
    settled = true
    clearResultTimer()
    reject(error)
    if (!transcriptSettled) {
      transcriptSettled = true
      rejectTranscript(error)
    }
  }

  const clearResultTimer = () => {
    if (!resultTimer) return
    clearTimeout(resultTimer)
    resultTimer = null
  }

  const armResultTimer = () => {
    clearResultTimer()
    resultTimer = setTimeout(() => fail(new Error('Realtime Mirror timed out.')), timeoutMs)
  }

  const sessionTranscript = () =>
    transcriptOrder
      .map((id) => transcriptParts.get(id)?.trim())
      .filter(Boolean)
      .join(' ')
      .trim()

  const currentTranscript = () => combineTranscript(input.initialTranscript, sessionTranscript())

  const resolveTranscript = () => {
    const transcript = currentTranscript()
    if (!transcript || transcriptSettled) return
    transcriptSettled = true
    settleTranscript(transcript)
  }

  const recordTranscript = (
    event: Record<string, unknown>,
    value: string,
    { append }: { append: boolean },
  ) => {
    if (!value.trim()) return
    const itemId = transcriptItemId(event)
    if (!itemId && !fallbackTranscriptId) {
      fallbackTranscriptIndex += 1
      fallbackTranscriptId = `unidentified-input-${fallbackTranscriptIndex}`
    }
    const id = itemId ?? fallbackTranscriptId
    if (!id) return
    if (!itemId) fallbackTranscriptId = id
    if (!transcriptParts.has(id)) transcriptOrder.push(id)
    const previous = append ? (transcriptParts.get(id) ?? '') : ''
    const nextText = append ? `${previous}${value}` : value.trim()
    transcriptParts.set(id, nextText)
    onConversationUpdate?.({
      id,
      role: 'student',
      text: nextText.trim(),
      status: append ? 'streaming' : 'final',
    })
    if (!append || itemId) fallbackTranscriptId = null
    resolveTranscript()
  }

  const recordAssistantTranscript = (
    event: Record<string, unknown>,
    value: string,
    { append }: { append: boolean },
  ) => {
    if (!value.trim()) return
    const id = getRealtimeResponseId(event) ?? 'kira-live-response'
    const previous = append ? (assistantParts.get(id) ?? '') : ''
    const nextText = append ? `${previous}${value}` : value.trim()
    assistantParts.set(id, nextText)
    onConversationUpdate?.({
      id,
      role: 'kira',
      text: nextText.trim(),
      status: append ? 'streaming' : 'final',
    })
  }

  const expectJsonResponse = () => {
    finalText = ''
    responseDone = false
    acceptUnidentifiedJsonResponse = true
    armResultTimer()
  }

  const isExpectedJsonResponse = (event: Record<string, unknown>) => {
    const responseId = getRealtimeResponseId(event)
    return responseId ? jsonResponseIds.has(responseId) : acceptUnidentifiedJsonResponse
  }

  const tryResolve = () => {
    if (settled || !responseDone || !finalText.trim()) return
    const combinedTranscript = currentTranscript()
    if (!combinedTranscript) {
      fail(new Error('Realtime Mirror did not return a transcript.'))
      return
    }
    const output = parseMirrorRealtimeText(finalText)
    if (!output) {
      if (onRepairNeeded && repairAttempts < maxRepairAttempts) {
        const previousText = finalText
        repairAttempts += 1
        finalText = ''
        responseDone = false
        expectJsonResponse()
        onRepairNeeded(previousText, combinedTranscript)
        return
      }
      fail(new Error('Realtime Mirror returned unparseable JSON.'))
      return
    }
    settled = true
    clearResultTimer()
    settle({
      localCaptureId: input.localCaptureId,
      transcript: combinedTranscript,
      validation: output.validation,
      inferredMeaning: output.inferred_meaning,
      storyReframe: output.story_reframe,
      contextType: input.contextType ?? 'school',
      mood: input.mood ?? null,
      evalReview: null,
      transcription: {
        provider: 'openai_realtime',
        transcript: combinedTranscript,
      },
    })
  }

  const accept = (event: Record<string, unknown>) => {
    if (settled) return
    if (event.type === 'response.created') {
      const response = event.response as
        | { id?: unknown; metadata?: Record<string, unknown> | null }
        | undefined
      if (isMirrorJsonPurpose(response?.metadata) && typeof response?.id === 'string') {
        jsonResponseIds.add(response.id)
        acceptUnidentifiedJsonResponse = false
      }
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed') {
      recordTranscript(event, typeof event.transcript === 'string' ? event.transcript : '', {
        append: false,
      })
    }
    if (event.type === 'conversation.item.input_audio_transcription.delta') {
      const delta = typeof event.delta === 'string' ? event.delta : ''
      recordTranscript(event, delta, { append: true })
    }
    if (event.type === 'conversation.item.input_audio_transcription.segment') {
      recordTranscript(event, typeof event.transcript === 'string' ? event.transcript : '', {
        append: false,
      })
    }
    if (event.type === 'conversation.item.input_audio_transcription.failed') {
      fail(new Error('Realtime Mirror could not transcribe the voice note.'))
      return
    }
    if (
      (event.type === 'response.output_text.done' || event.type === 'response.text.done') &&
      isExpectedJsonResponse(event)
    ) {
      finalText = typeof event.text === 'string' ? event.text : finalText
    }
    if (event.type === 'response.output_audio_transcript.done' && isExpectedJsonResponse(event)) {
      finalText = typeof event.transcript === 'string' ? event.transcript : finalText
    }
    if (event.type === 'response.output_audio_transcript.done' && !isExpectedJsonResponse(event)) {
      recordAssistantTranscript(
        event,
        typeof event.transcript === 'string' ? event.transcript : '',
        {
          append: false,
        },
      )
    }
    if (event.type === 'response.output_audio_transcript.delta' && isExpectedJsonResponse(event)) {
      const delta = typeof event.delta === 'string' ? event.delta : ''
      finalText = `${finalText}${delta}`
    }
    if (event.type === 'response.output_audio_transcript.delta' && !isExpectedJsonResponse(event)) {
      recordAssistantTranscript(event, typeof event.delta === 'string' ? event.delta : '', {
        append: true,
      })
    }
    if (event.type === 'response.done' && isExpectedJsonResponse(event)) {
      const response = event.response as
        | {
            id?: string
            status?: string
            metadata?: Record<string, unknown> | null
            output?: Array<{ type?: string; content?: Array<Record<string, unknown>> }>
          }
        | undefined
      if (response?.status && response.status !== 'completed') {
        fail(new Error(`Realtime Mirror response ended with ${response.status}.`))
        return
      }
      finalText ||= extractTextFromResponse(response)
      responseDone = true
      const responseId = getRealtimeResponseId(event)
      if (responseId) jsonResponseIds.delete(responseId)
    }
    if (event.type === 'error') {
      const err = event.error as { message?: unknown } | undefined
      fail(new Error(typeof err?.message === 'string' ? err.message : 'Realtime Mirror failed.'))
      return
    }
    tryResolve()
  }

  return {
    result,
    transcript: transcriptResult,
    currentTranscript,
    expectJsonResponse,
    accept,
    fail,
  }
}

async function sendRealtimeMirrorLiveSessionUpdateWhenOpen(
  dataChannel: MinimalDataChannel,
): Promise<void> {
  await waitForDataChannelOpen(dataChannel)
  dataChannel.send(
    JSON.stringify({
      type: 'session.update',
      session: {
        type: 'realtime',
        instructions: buildRealtimeMirrorLiveInstructions(),
        output_modalities: ['audio'],
        audio: {
          input: {
            transcription: {
              model: 'gpt-4o-mini-transcribe',
              language: 'en',
            },
            noise_reduction: { type: 'near_field' },
            turn_detection: {
              type: 'semantic_vad',
              create_response: true,
              interrupt_response: true,
              eagerness: 'auto',
            },
          },
        },
        tool_choice: 'none',
        tools: [],
      },
    }),
  )
}

function normalizeAccumulatorOptions(
  options: number | RealtimeMirrorAccumulatorOptions,
): Required<Pick<RealtimeMirrorAccumulatorOptions, 'timeoutMs' | 'maxRepairAttempts'>> &
  Pick<RealtimeMirrorAccumulatorOptions, 'onRepairNeeded' | 'onConversationUpdate'> {
  if (typeof options === 'number') {
    return {
      timeoutMs: options,
      maxRepairAttempts: 0,
      onRepairNeeded: undefined,
      onConversationUpdate: undefined,
    }
  }
  return {
    timeoutMs: options.timeoutMs ?? DEFAULT_RESULT_TIMEOUT_MS,
    maxRepairAttempts: options.maxRepairAttempts ?? (options.onRepairNeeded ? 1 : 0),
    onRepairNeeded: options.onRepairNeeded,
    onConversationUpdate: options.onConversationUpdate,
  }
}

function combineTranscript(...parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
    .trim()
}

function sendRealtimeMirrorResponse(
  dataChannel: MinimalDataChannel,
  userText: string,
  {
    modality,
    purpose,
  }: {
    modality: 'text' | 'audio'
    purpose: 'mirror_final_json' | 'mirror_repair_json'
  },
) {
  dataChannel.send(
    JSON.stringify({
      type: 'response.create',
      response: {
        conversation: 'none',
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: userText }],
          },
        ],
        output_modalities: [modality],
        ...(modality === 'audio'
          ? { audio: { output: { voice: OPENAI_REALTIME_MIRROR_VOICE } } }
          : {}),
        max_output_tokens: 1000,
        instructions: buildRealtimeMirrorResponseInstructions(),
        metadata: {
          purpose,
          source: 'student-space',
          agent: 'mirror',
          provider: 'openai_realtime',
          voice: modality === 'audio' ? OPENAI_REALTIME_MIRROR_VOICE : undefined,
        },
      },
    }),
  )
}

function isMirrorJsonPurpose(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.purpose === 'mirror_final_json' || metadata?.purpose === 'mirror_repair_json'
}

function getRealtimeResponseId(event: Record<string, unknown>): string | undefined {
  if (typeof event.response_id === 'string') return event.response_id
  const response = event.response as { id?: unknown } | undefined
  return typeof response?.id === 'string' ? response.id : undefined
}

function transcriptItemId(event: Record<string, unknown>): string | undefined {
  if (typeof event.item_id === 'string') return event.item_id
  const item = event.item as { id?: unknown } | undefined
  return typeof item?.id === 'string' ? item.id : undefined
}

function extractTextFromResponse(
  response:
    | { output?: Array<{ type?: string; content?: Array<Record<string, unknown>> }> }
    | undefined,
): string {
  const parts: string[] = []
  for (const item of response?.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (typeof part.text === 'string') parts.push(part.text)
      if (typeof part.transcript === 'string') parts.push(part.transcript)
    }
  }
  return parts.join('\n').trim()
}

function createRemoteAudioOutput(createAudioElement?: () => HTMLAudioElement): {
  attach: (event: RTCTrackEvent) => void
  close: () => void
} {
  const audio =
    createAudioElement?.() ??
    (typeof document !== 'undefined' ? document.createElement('audio') : null)
  if (!audio) {
    return {
      attach: () => {},
      close: () => {},
    }
  }

  audio.autoplay = true
  ;(audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  audio.style.display = 'none'
  if (
    !audio.parentElement &&
    typeof document !== 'undefined' &&
    document.body &&
    typeof Node !== 'undefined' &&
    audio instanceof Node
  ) {
    document.body.append(audio)
  }

  return {
    attach: (event) => {
      const stream =
        event.streams?.[0] ??
        (typeof MediaStream !== 'undefined' ? new MediaStream([event.track]) : null)
      if (!stream) return
      audio.srcObject = stream
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // Browser autoplay policy can still block output; the session remains usable.
        })
      }
    },
    close: () => {
      try {
        audio.pause()
      } catch {
        // Best effort browser cleanup.
      }
      audio.srcObject = null
      audio.remove()
    },
  }
}

async function displaySafeRealtimeSetupError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error
  } catch {
    // SDP error bodies are not necessarily JSON.
  }
  return `Realtime session setup failed with status ${response.status}.`
}

function waitForDataChannelOpen(dataChannel: MinimalDataChannel): Promise<void> {
  if (dataChannel.readyState === 'open') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Realtime voice channel did not open.'))
    }, 10_000)
    const onOpen = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Realtime voice channel failed.'))
    }
    const cleanup = () => {
      clearTimeout(timer)
      dataChannel.removeEventListener('open', onOpen)
      dataChannel.removeEventListener('error', onError)
    }
    dataChannel.addEventListener('open', onOpen)
    dataChannel.addEventListener('error', onError)
  })
}

function waitForRealtimeTranscript(
  transcript: Promise<string>,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Realtime Mirror did not receive a transcript.')),
      timeoutMs,
    )
    transcript.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function teardownRealtimeCapture(
  peer: MinimalPeerConnection,
  dataChannel: MinimalDataChannel,
  stream: MediaStream,
  remoteAudio: { close: () => void },
) {
  stopStreamTracks(stream)
  remoteAudio.close()
  try {
    dataChannel.close()
  } catch {
    // Best effort browser cleanup.
  }
  try {
    peer.close()
  } catch {
    // Best effort browser cleanup.
  }
}

function stopStreamTracks(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      // Best effort browser cleanup.
    }
  }
}
