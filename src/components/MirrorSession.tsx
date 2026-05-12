import { useEffect, useReducer, useRef } from 'react'
import { type ContextType, ContextTypePicker } from '~/components/ContextTypePicker'
import { Button } from '~/components/ui/button'
import { persistMirror } from '~/server/persist-mirror.functions'
import { runMirror } from '~/server/run-mirror.functions'
import { transcribeMirror } from '~/server/transcribe-mirror.functions'

/** 90-second soft time-box; Stop is always available. */
const SOFT_TIMEBOX_MS = 90_000
/** Silence threshold before the single soft prompt appears. */
const OPENING_SILENCE_MS = 3_000
/** RMS amplitude (0-1) below which we count a frame as silent. Tuned on local mic. */
const SILENCE_RMS_THRESHOLD = 0.012

type Phase =
  | 'idle'
  | 'permission-pending'
  | 'recording'
  | 'transcribing'
  | 'picking-context'
  | 'reflecting'
  | 'persisting'
  | 'done'
  | 'error'

interface State {
  phase: Phase
  showSoftPrompt: boolean
  elapsedMs: number
  /** Smoothed amplitude for the volume ring [0..1]. */
  amplitude: number
  errorMessage: string | null
  /**
   * U7: held between `transcribing` → `picking-context` → `reflecting`. If the
   * user navigates away during `picking-context`, the transcript is discarded
   * with the component unmount and no `persistMirror` is invoked.
   */
  pendingTranscript: string | null
}

type Action =
  | { type: 'permissions-granted' }
  | { type: 'permission-error'; message: string }
  | { type: 'tick'; elapsedMs: number; amplitude: number }
  | { type: 'opening-silence' }
  | { type: 'stop-pressed' }
  | { type: 'transcribing' }
  | { type: 'picking-context'; transcript: string }
  | { type: 'reflecting' }
  | { type: 'persisting' }
  | { type: 'done' }
  | { type: 'fail'; message: string }
  | { type: 'reset' }

const initialState: State = {
  phase: 'idle',
  showSoftPrompt: false,
  elapsedMs: 0,
  amplitude: 0,
  errorMessage: null,
  pendingTranscript: null,
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'permissions-granted':
      return { ...state, phase: 'recording', errorMessage: null }
    case 'permission-error':
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'tick':
      return { ...state, elapsedMs: action.elapsedMs, amplitude: action.amplitude }
    case 'opening-silence':
      return { ...state, showSoftPrompt: true }
    case 'stop-pressed':
      return state.phase === 'recording' ? { ...state, phase: 'transcribing' } : state
    case 'transcribing':
      return { ...state, phase: 'transcribing' }
    case 'picking-context':
      return { ...state, phase: 'picking-context', pendingTranscript: action.transcript }
    case 'reflecting':
      return { ...state, phase: 'reflecting' }
    case 'persisting':
      return { ...state, phase: 'persisting' }
    case 'done':
      return { ...state, phase: 'done' }
    case 'fail':
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'reset':
      return initialState
  }
}

export interface MirrorSessionResult {
  entryId: number
  /** U7 auto-Connector outcome. Callers route on this to /reflect/review.
   * Finding #7 split the previous catch-all `schema_reject` into discrete
   * failure buckets — add the new strings so the consumer can render a
   * specific error toast per cause. */
  autoConnectorStatus:
    | 'ok'
    | 'queued'
    | 'timeout'
    | 'schema_reject'
    | 'transport_error'
    | 'auth_error'
    | 'unknown'
    | 'missing_mirror'
  /** R30: true iff a prior pending diff caused this run to be queued. */
  pendingQueued: boolean
}

export interface MirrorSessionProps {
  /**
   * Called after `persistMirror` succeeds. The callback receives the
   * mirror-entry id, the auto-Connector status, and the R30 queued flag
   * so the consumer can decide where to route. In U8 the consumer in
   * `routes/reflect.tsx` always routes to `/reflect/review` — that
   * route's loader surfaces the prior pending diff when `pendingQueued`
   * is true, or the newly-staged diff when the chain returned `ok`.
   */
  onPersisted?: (result: MirrorSessionResult) => void
}

/**
 * Quiet-mirror reflection ritual. Webcam feed is the mirror surface
 * (visual-only, locally rendered, horizontally flipped). Audio is
 * captured via MediaRecorder and transcribed by Whisper after Stop.
 *
 * No AI voice during the session. The only in-session prompt is a
 * single soft text line shown once if the student stays silent for
 * the first ~3 seconds.
 */
export function MirrorSession({ onPersisted }: MirrorSessionProps) {
  const [state, dispatch] = useReducer(reduce, initialState)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const silentSinceRef = useRef<number | null>(null)
  const softPromptFiredRef = useRef(false)
  const stopPromiseRef = useRef<{
    resolve: (blob: Blob) => void
    reject: (err: Error) => void
  } | null>(null)

  // Acquire camera + mic on mount, start recording.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect; cleanup and handleStop close over refs that are stable for the lifetime of the component
  useEffect(() => {
    let cancelled = false

    // Dev-only seam: ?inject=<transcript> skips media acquisition entirely so
    // headless/automation smoke tests (and humans without a working mic) can
    // drive the rest of the F1 pipeline. Dead-stripped from production builds
    // via `import.meta.env.DEV`.
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const injected = new URLSearchParams(window.location.search).get('inject')
      if (injected && injected.trim().length > 0) {
        dispatch({ type: 'picking-context', transcript: injected.trim() })
        return () => {
          cancelled = true
        }
      }
    }

    async function acquire() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        dispatch({
          type: 'permission-error',
          message: 'Your browser does not support webcam capture.',
        })
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: { ideal: 720 }, height: { ideal: 720 } },
        })
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }

        // Audio context + analyser for the volume ring + silence detection.
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 1024
        source.connect(analyser)
        analyserRef.current = analyser

        // Recorder for audio only — video is render-only.
        const audioOnlyStream = new MediaStream(stream.getAudioTracks())
        const mimeType = pickMimeType()
        const recorder = new MediaRecorder(audioOnlyStream, mimeType ? { mimeType } : undefined)
        recorderRef.current = recorder
        chunksRef.current = []
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunksRef.current.push(ev.data)
        }
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          })
          stopPromiseRef.current?.resolve(blob)
          stopPromiseRef.current = null
        }
        recorder.onerror = (ev) => {
          const message =
            (ev as unknown as { error?: { message?: string } })?.error?.message ?? 'Recorder error.'
          stopPromiseRef.current?.reject(new Error(message))
          stopPromiseRef.current = null
        }
        recorder.start(250)

        startedAtRef.current = performance.now()
        silentSinceRef.current = startedAtRef.current
        dispatch({ type: 'permissions-granted' })

        startVolumeLoop()
      } catch (err) {
        dispatch({ type: 'permission-error', message: friendlyMediaError(err) })
      }
    }

    function startVolumeLoop() {
      const analyser = analyserRef.current
      if (!analyser) return
      const buf = new Float32Array(analyser.fftSize)
      const tick = () => {
        analyser.getFloatTimeDomainData(buf)
        let sum = 0
        for (let i = 0; i < buf.length; i++) {
          const v = buf[i] ?? 0
          sum += v * v
        }
        const rms = Math.sqrt(sum / buf.length)
        const startedAt = startedAtRef.current ?? performance.now()
        const elapsedMs = performance.now() - startedAt

        // Smooth the amplitude — no jitter.
        const target = Math.min(1, rms * 12)
        // exponential moving average; alpha ~0.15
        const prev = analyser as unknown as { _prevAmp?: number }
        const next = (prev._prevAmp ?? 0) * 0.85 + target * 0.15
        prev._prevAmp = next

        // Silence accounting.
        if (rms < SILENCE_RMS_THRESHOLD) {
          if (silentSinceRef.current == null) silentSinceRef.current = performance.now()
          const silentFor = performance.now() - silentSinceRef.current
          if (
            !softPromptFiredRef.current &&
            elapsedMs >= 0 &&
            silentFor >= OPENING_SILENCE_MS &&
            elapsedMs <= OPENING_SILENCE_MS + 1500
          ) {
            softPromptFiredRef.current = true
            dispatch({ type: 'opening-silence' })
          }
        } else {
          silentSinceRef.current = null
        }

        dispatch({ type: 'tick', elapsedMs, amplitude: next })

        if (elapsedMs >= SOFT_TIMEBOX_MS && recorderRef.current?.state === 'recording') {
          // Auto-stop at the soft time-box.
          void handleStop()
          return
        }

        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    void acquire()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  function cleanup() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        // noop
      }
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined)
      audioCtxRef.current = null
    }
    if (streamRef.current) {
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }

  async function handleStop() {
    if (state.phase !== 'recording' && state.phase !== 'permission-pending') return
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    dispatch({ type: 'stop-pressed' })

    const blob = await stopRecorder()
    if (blob.size === 0) {
      dispatch({
        type: 'fail',
        message: 'No audio was captured. Try again, and remember to allow microphone access.',
      })
      return
    }

    try {
      dispatch({ type: 'transcribing' })
      const audioBase64 = await blobToBase64(blob)
      const { transcript } = await transcribeMirror({
        data: { audioBase64, mimeType: blob.type || 'audio/webm' },
      })
      if (!transcript || transcript.trim().length === 0) {
        dispatch({ type: 'fail', message: 'Transcription came back empty. Try again?' })
        return
      }

      // U7: pause at `picking-context` for the student to pick the VIPS
      // parallax context_type. The chain resumes in `handleContextChosen`.
      dispatch({ type: 'picking-context', transcript })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong saving the reflection.'
      dispatch({ type: 'fail', message })
    } finally {
      // Release media stream regardless of branch — recorder is already stopped.
      // The Mirror agent + persistMirror run server-side after the picker
      // selection; no audio is needed beyond this point.
      cleanup()
    }
  }

  async function handleContextChosen(contextType: ContextType) {
    const transcript = state.pendingTranscript
    if (!transcript) {
      dispatch({ type: 'fail', message: 'Lost the transcript before context was chosen.' })
      return
    }
    try {
      dispatch({ type: 'reflecting' })
      const { output } = await runMirror({ data: { transcript } })

      dispatch({ type: 'persisting' })
      const result = await persistMirror({
        data: {
          entry: {
            transcript,
            validation: output.validation,
            inferred_meaning: output.inferred_meaning,
            story_reframe: output.story_reframe,
          },
          context_type: contextType,
          raw_output: output,
          trace: { capturedDurationMs: state.elapsedMs },
        },
      })

      dispatch({ type: 'done' })
      onPersisted?.({
        entryId: result.mirror_entry.id,
        autoConnectorStatus: result.auto_connector_status,
        pendingQueued: result.pending_queued,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong saving the reflection.'
      dispatch({ type: 'fail', message })
    }
  }

  function stopRecorder(): Promise<Blob> {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(new Blob([], { type: 'audio/webm' }))
    }
    return new Promise<Blob>((resolve, reject) => {
      stopPromiseRef.current = { resolve, reject }
      try {
        recorder.stop()
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const remainingMs = Math.max(0, SOFT_TIMEBOX_MS - state.elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const ringScale = 1 + state.amplitude * 0.18

  if (state.phase === 'error') {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
        <p className="font-medium">Couldn’t start the mirror.</p>
        <p className="text-muted-foreground">{state.errorMessage}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            cleanup()
            dispatch({ type: 'reset' })
          }}
        >
          Try again
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="relative aspect-square w-full max-w-md overflow-hidden rounded-2xl"
        data-testid="mirror-frame"
      >
        {/* Volume-reactive ring */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-accent/40 transition-transform duration-100 ease-out"
          style={{ transform: `scale(${ringScale})` }}
          aria-hidden
        />
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          // The mirror metaphor — the student sees themselves the way a real mirror would show them.
          style={{ transform: 'scaleX(-1)' }}
          autoPlay
          muted
          playsInline
        />
        {state.showSoftPrompt && state.phase === 'recording' ? (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground/85 px-4 py-2 text-xs text-background shadow-lg"
            data-testid="soft-prompt"
          >
            Just talk to yourself, naturally.
          </div>
        ) : null}
      </div>

      <div className="flex w-full max-w-md flex-col items-center gap-3">
        <PhaseLabel phase={state.phase} remainingSec={remainingSec} />
        {state.phase === 'picking-context' && state.pendingTranscript ? (
          <div className="flex w-full flex-col gap-3" data-testid="picking-context-block">
            <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Here’s what I heard: </span>
              {state.pendingTranscript}
            </div>
            <ContextTypePicker onSelect={(value) => void handleContextChosen(value)} />
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleStop()}
            disabled={state.phase !== 'recording'}
            data-testid="stop-button"
          >
            Stop and reflect
          </Button>
        </div>
        {state.errorMessage ? (
          <p className="text-xs text-warning" role="alert">
            {state.errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function PhaseLabel({ phase, remainingSec }: { phase: Phase; remainingSec: number }) {
  if (phase === 'recording') {
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        listening · {remainingSec}s remaining (or stop whenever)
      </p>
    )
  }
  if (phase === 'transcribing')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        transcribing what you said…
      </p>
    )
  if (phase === 'picking-context')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        what was this about?
      </p>
    )
  if (phase === 'reflecting')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        Mirror is reflecting back…
      </p>
    )
  if (phase === 'persisting')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        saving to your library…
      </p>
    )
  if (phase === 'done')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        done. Opening your reflection.
      </p>
    )
  if (phase === 'permission-pending' || phase === 'idle')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        granting camera + microphone…
      </p>
    )
  return null
}

function friendlyMediaError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const raw = err instanceof Error ? err.message : String(err ?? 'unknown error')
  if (name === 'NotAllowedError' || /permission denied|not allowed/i.test(raw)) {
    return [
      'Camera + microphone access was denied without a prompt.',
      'On macOS: open System Settings → Privacy & Security → Camera, make sure your browser is enabled. Repeat for Microphone. Quit and re-open the browser, then refresh.',
      'If the browser already asked once and you said No, click the lock/site-info icon in the address bar and re-allow Camera + Microphone for localhost.',
    ].join(' ')
  }
  if (name === 'NotFoundError') {
    return 'No camera or microphone was found on this device.'
  }
  if (name === 'NotReadableError') {
    return 'Camera or microphone is in use by another app. Close the other app and try again.'
  }
  if (name === 'SecurityError') {
    return 'Browser blocked the request because the page is not in a secure context. Try http://localhost:3000 specifically (not 127.0.0.1).'
  }
  return `Could not acquire camera or microphone: ${raw}`
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c
  }
  return undefined
}

function stopStream(stream: MediaStream) {
  for (const t of stream.getTracks()) {
    try {
      t.stop()
    } catch {
      // noop
    }
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  // browser's btoa works on binary strings
  return btoa(binary)
}
