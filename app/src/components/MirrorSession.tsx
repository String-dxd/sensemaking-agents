import { useEffect, useRef, useState } from 'react'
import mirrorPrompt from '~/agents/mirror.prompt.md?raw'
import { handleRealtimeEvent } from '~/agents/mirror-event-router'
import { MirrorEntrySchema } from '~/agents/schemas'
import { realtimeToolConfig } from '~/agents/tools/search-corpus'
import { Button } from '~/components/ui/button'
import { mintMirrorSession } from '~/server/mirror-session.functions'
import { persistMirror } from '~/server/persist-mirror.functions'
import { searchPastMirrors } from '~/server/search-past-mirrors.functions'

const MIRROR_INSTRUCTIONS = mirrorPrompt

type SessionStatus =
  | 'idle'
  | 'minting'
  | 'connecting'
  | 'active'
  | 'ending'
  | 'persisting'
  | 'ended'
  | 'error'

export interface MirrorSessionProps {
  studentId: string
  /** Called once the peer connection is fully established. */
  onActive?: () => void
  /** Called when the structured payload has been validated and persisted. */
  onPersisted?: (entryId: number) => void
  /** Called when the session ends (user-initiated or remote). */
  onEnded?: (transcript: string) => void
}

const REALTIME_BASE = 'https://api.openai.com/v1/realtime'

/**
 * U4 Mirror live-session client. Establishes a direct browser → OpenAI
 * Realtime WebRTC peer connection using the ephemeral token minted by
 * `mintMirrorSession`. Audio is captured and played; the running
 * transcript is collected from `response.audio_transcript.delta` events
 * over the data channel. No audio bytes are persisted client-side.
 *
 * U5 adds tool-call routing on the data channel and session-end
 * persistence; this component holds the wiring those steps build on.
 */
export function MirrorSession({ studentId, onActive, onEnded, onPersisted }: MirrorSessionProps) {
  const [status, setStatus] = useState<SessionStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: cleanup is stable; effect runs once on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  function cleanup() {
    dcRef.current?.close()
    dcRef.current = null
    pcRef.current?.close()
    pcRef.current = null
    const tracks = localStreamRef.current?.getTracks() ?? []
    for (const t of tracks) t.stop()
    localStreamRef.current = null
  }

  async function start() {
    setError(null)
    setTranscript('')
    setStatus('minting')
    try {
      const { ephemeralKey, model } = await mintMirrorSession({ data: { studentId } })

      setStatus('connecting')
      const pc = new RTCPeerConnection()
      pcRef.current = pc

      // Outbound audio: mic → peer.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream)
      }

      // Inbound audio: peer → speakers.
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams
        if (remoteStream && audioRef.current) {
          audioRef.current.srcObject = remoteStream
        }
      }

      // Data channel for events (transcripts, tool calls, structured-output).
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.addEventListener('message', (msg) => {
        if (typeof msg.data !== 'string') return
        // Structured-output capture for session-end persistence.
        try {
          const parsed = JSON.parse(msg.data) as { type?: string; text?: string }
          if (
            (parsed.type === 'response.output_text.done' || parsed.type === 'response.text.done') &&
            typeof parsed.text === 'string'
          ) {
            void persistFinalPayload(parsed.text)
          }
        } catch {
          /* fall through to router */
        }
        void handleRealtimeEvent({
          raw: msg.data,
          studentId,
          send: (envelope) => dc.send(JSON.stringify(envelope)),
          onTranscriptDelta: (delta) => setTranscript((prev) => prev + delta),
          onTranscriptDone: (full) => setTranscript(full),
          runSearch: async (input) =>
            searchPastMirrors({
              data: { studentId, query: input.query, limit: input.limit },
            }),
        })
      })
      dc.addEventListener('open', () => {
        // Push the Mirror session config + the single tool. The realtime
        // model needs `instructions` and `tools` in a `session.update`
        // before it'll invoke the tool.
        dc.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              instructions: MIRROR_INSTRUCTIONS,
              tools: [realtimeToolConfig()],
            },
          }),
        )
        setStatus('active')
        onActive?.()
      })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpResponse = await fetch(`${REALTIME_BASE}?model=${encodeURIComponent(model)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
          'OpenAI-Beta': 'realtime=v1',
        },
        body: offer.sdp ?? '',
      })

      if (!sdpResponse.ok) {
        throw new Error(
          `Realtime SDP exchange failed: ${sdpResponse.status} ${sdpResponse.statusText}`,
        )
      }

      const answerSdp = await sdpResponse.text()
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
    } catch (e: unknown) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Failed to start Mirror session.')
      cleanup()
    }
  }

  function end() {
    setStatus('ending')
    onEnded?.(transcript)
    const dc = dcRef.current
    if (dc && dc.readyState === 'open') {
      dc.send(
        JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['text'],
            instructions:
              'The session is ending. Return ONLY a JSON object matching this exact shape: { "summary": string, "transcript": string, "signals": [{ "kind": "observed"|"inferred"|"uncertain", "text": string }], "caution": string, "tags": string[] }. No prose. No markdown.',
          },
        }),
      )
    } else {
      setStatus('ended')
      cleanup()
    }
  }

  async function persistFinalPayload(rawText: string) {
    if (status !== 'ending') return
    setStatus('persisting')
    try {
      // The model is instructed to return raw JSON; allow a stray code-fence.
      const cleaned = rawText.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
      const draft = MirrorEntrySchema.parse(JSON.parse(cleaned))
      const row = await persistMirror({
        data: {
          studentId,
          entry: draft,
        },
      })
      setStatus('ended')
      cleanup()
      onPersisted?.(row.id)
    } catch (e) {
      setStatus('error')
      setError(
        e instanceof Error
          ? `Failed to persist reflection: ${e.message}`
          : 'Failed to persist reflection.',
      )
      cleanup()
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="mirror-session">
      {/* biome-ignore lint/a11y/useMediaCaption: realtime audio has no static caption track; transcript renders below */}
      <audio ref={audioRef} autoPlay playsInline></audio>
      <div className="flex items-center gap-3">
        {status === 'idle' || status === 'ended' || status === 'error' ? (
          <Button variant="accent" onClick={start} data-testid="start-voice">
            Start a reflection
          </Button>
        ) : null}
        {status === 'active' ? (
          <Button variant="outline" onClick={end} data-testid="end-voice">
            End reflection
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground" data-testid="mirror-status">
          status: {status}
        </span>
      </div>
      {transcript ? (
        <p
          className="rounded border border-border bg-muted/40 p-3 text-sm"
          data-testid="mirror-transcript"
        >
          {transcript}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-warning" role="alert" data-testid="mirror-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
