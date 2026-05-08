import { useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { mintMirrorSession } from '~/server/mirror-session.functions'

type SessionStatus = 'idle' | 'minting' | 'connecting' | 'active' | 'ended' | 'error'

export interface MirrorSessionProps {
  studentId: string
  /** Called once the peer connection is fully established. */
  onActive?: () => void
  /** Called when the session ends (user-initiated or remote). U5 hands off to persistence here. */
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
export function MirrorSession({ studentId, onActive, onEnded }: MirrorSessionProps) {
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

      // Data channel for events (transcripts, tool calls in U5).
      const dc = pc.createDataChannel('oai-events')
      dcRef.current = dc
      dc.addEventListener('message', (msg) => handleEvent(msg.data))
      dc.addEventListener('open', () => {
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

  function handleEvent(raw: unknown) {
    if (typeof raw !== 'string') return
    let event: { type?: string; delta?: string; transcript?: string }
    try {
      event = JSON.parse(raw) as typeof event
    } catch {
      return
    }
    // U5 will branch on type to route tool calls; U4 only listens for transcript fragments.
    if (event.type === 'response.audio_transcript.delta' && typeof event.delta === 'string') {
      setTranscript((prev) => prev + event.delta)
    }
    if (
      event.type === 'response.audio_transcript.done' &&
      typeof event.transcript === 'string' &&
      event.transcript.length > 0
    ) {
      // Use the canonical full transcript from the server when it arrives.
      setTranscript(event.transcript)
    }
  }

  function end() {
    const finalTranscript = transcript
    cleanup()
    setStatus('ended')
    onEnded?.(finalTranscript)
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
