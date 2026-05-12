/**
 * Voice-mode session controller. Audio-only — the camera and any
 * <video> element from the v0.1 webcam-as-mirror ritual are retired. The
 * world stage stays visible as the ambient surface while the student
 * talks; the volume-reactive halo lives on the Voice/Stop button itself.
 *
 * Linear chain on Stop: transcribing → reflecting → persisting → done →
 * navigate to /reflect/review. No post-Stop context picker — `context_type`
 * defaults to the last-used value from localStorage (matching the
 * ContextTypePicker fallback). Phase B revisits whether `context_type`
 * survives at all once `mood` + `inferred_emotion` land.
 *
 * `state.mood` lives in local React state only this plan — Phase A does
 * NOT modify the persistMirror data contract. Phase B (after the
 * Managed Agents migration) wires `state.mood` and Mirror's emitted
 * `inferred_emotion` into the DB through the new Drizzle layer.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { Mood } from '~/agents/tools/schemas'
import type { ContextType } from '~/components/ContextTypePicker'
import { Button } from '~/components/ui/button'
import { readLastUsedContextType } from '~/lib/context-type-storage'
import { persistMirror } from '~/server/persist-mirror.functions'
import { runMirror } from '~/server/run-mirror.functions'
import { transcribeMirror } from '~/server/transcribe-mirror.functions'

export type { Mood }

/** 90-second soft time-box; Stop is always available. */
const SOFT_TIMEBOX_MS = 90_000
/** Silence threshold before the single soft prompt appears. */
const OPENING_SILENCE_MS = 3_000
/** RMS amplitude (0-1) below which we count a frame as silent. Tuned on local mic. */
const SILENCE_RMS_THRESHOLD = 0.012

type Phase =
  | 'idle'
  | 'requesting-mic'
  | 'recording'
  | 'transcribing'
  | 'reflecting'
  | 'persisting'
  | 'done'
  | 'error'

interface State {
  phase: Phase
  showSoftPrompt: boolean
  elapsedMs: number
  /** Smoothed amplitude for the volume halo [0..1]. */
  amplitude: number
  errorMessage: string | null
  /**
   * Held between `transcribing` → `reflecting` so the post-Stop chain has
   * the transcript even if React re-renders interleave.
   */
  pendingTranscript: string | null
  /**
   * User-tagged emotion. Optional, never blocking. Phase A: stays local;
   * not forwarded to persistMirror. Phase B adds the column + wiring.
   */
  mood: Mood | null
}

type Action =
  | { type: 'request-mic' }
  | { type: 'permissions-granted' }
  | { type: 'permission-error'; message: string }
  | { type: 'tick'; elapsedMs: number; amplitude: number }
  | { type: 'opening-silence' }
  | { type: 'stop-pressed' }
  | { type: 'transcribing'; transcript: string }
  | { type: 'reflecting' }
  | { type: 'persisting' }
  | { type: 'done' }
  | { type: 'mood-tagged'; mood: Mood }
  | { type: 'fail'; message: string }
  | { type: 'retry-chain' }
  | { type: 'reset' }

const initialState: State = {
  phase: 'idle',
  showSoftPrompt: false,
  elapsedMs: 0,
  amplitude: 0,
  errorMessage: null,
  pendingTranscript: null,
  mood: null,
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'request-mic':
      return state.phase === 'idle' ? { ...state, phase: 'requesting-mic' } : state
    case 'permissions-granted':
      return { ...state, phase: 'recording', errorMessage: null }
    case 'permission-error':
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'tick':
      return { ...state, elapsedMs: action.elapsedMs, amplitude: action.amplitude }
    case 'opening-silence':
      // Guard against late rAF ticks: requestAnimationFrame can fire the
      // currently-scheduled callback once after cancelAnimationFrame, so the
      // tick can land after stop-pressed has flipped the phase. Without this
      // guard, the soft-prompt bubble would briefly flash during transcribing.
      return state.phase === 'recording' ? { ...state, showSoftPrompt: true } : state
    case 'stop-pressed':
      return state.phase === 'recording' ? { ...state, phase: 'transcribing' } : state
    case 'transcribing':
      return { ...state, phase: 'transcribing', pendingTranscript: action.transcript }
    case 'reflecting':
      return { ...state, phase: 'reflecting' }
    case 'persisting':
      return { ...state, phase: 'persisting' }
    case 'done':
      return { ...state, phase: 'done' }
    case 'mood-tagged':
      return state.phase === 'recording' ? { ...state, mood: action.mood } : state
    case 'fail':
      // Preserve `pendingTranscript` on fail so the user can retry the
      // post-Stop chain without re-recording. Reset to initialState only via
      // explicit `'reset'` (the "Start over" affordance).
      return { ...state, phase: 'error', errorMessage: action.message }
    case 'retry-chain':
      // Re-enter the post-Stop chain at the reflect step. Only valid from
      // 'error' with a held transcript — caller checks `pendingTranscript`
      // before dispatching.
      return state.phase === 'error' && state.pendingTranscript
        ? { ...state, phase: 'reflecting', errorMessage: null }
        : state
    case 'reset':
      return initialState
  }
}

export interface MirrorSessionResult {
  entryId: number
  autoConnectorStatus:
    | 'ok'
    | 'queued'
    | 'timeout'
    | 'schema_reject'
    | 'transport_error'
    | 'auth_error'
    | 'unknown'
    | 'missing_mirror'
  pendingQueued: boolean
}

export interface MirrorSessionOptions {
  studentId: string
  /** Called after `persistMirror` succeeds; parent routes from here. */
  onPersisted?: (result: MirrorSessionResult) => void
}

export interface MirrorSessionApi {
  phase: Phase
  mood: Mood | null
  amplitude: number
  showSoftPrompt: boolean
  remainingSec: number
  errorMessage: string | null
  /** True for any non-idle, non-error, non-done phase — sheets/library nav must lock here. */
  voiceModeActive: boolean
  /**
   * True when the post-Stop chain failed (reflect or persist) AFTER transcribe
   * succeeded. The held transcript is what `handleRetryChain` replays, so the
   * Retry button on the error panel is only meaningful in this state.
   */
  canRetryChain: boolean
  /** Toggles the recorder: start when idle, stop when recording. Idempotent elsewhere. */
  handleVoicePress: () => void
  /** Sets `state.mood` (only effective during `recording`). */
  handleMoodTagged: (mood: Mood) => void
  /**
   * Re-enters runPostStopChain using the held `pendingTranscript`, so a
   * transient failure during reflect/persist doesn't force the user to
   * re-record. No-op unless `canRetryChain` is true.
   */
  handleRetryChain: () => void
  /** Resets the state machine after an error. */
  handleReset: () => void
}

/**
 * Hook-based session controller. Returns the state machine plus the
 * handlers used by `LandingPage` to wire the Voice button + chip overlay.
 */
export function useMirrorSession({
  studentId,
  onPersisted,
}: MirrorSessionOptions): MirrorSessionApi {
  const [state, dispatch] = useReducer(reduce, initialState, (init: State): State => {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      const injected = new URLSearchParams(window.location.search).get('inject')
      if (injected && injected.trim().length > 0) {
        return {
          ...init,
          phase: 'transcribing' as Phase,
          pendingTranscript: injected.trim(),
        }
      }
    }
    return init
  })

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
  // Smoothed amplitude is read+written every animation frame; keeping it on a
  // ref avoids the `(analyser as unknown as { _prevAmp })` cast that previously
  // stashed component state on the DOM node.
  const prevAmpRef = useRef(0)
  // elapsedMs lives in both state (drives the remainingSec memo + halo) and a
  // ref (read by runPostStopChain's trace at Stop time). Reading the trace
  // from the ref instead of state lets us drop `state.elapsedMs` from the
  // post-stop callback's deps and stop rebuilding the handler chain every
  // animation frame during recording.
  const elapsedMsRef = useRef(0)
  // Tracks whether the hook is still mounted so async chain steps (transcribe
  // → reflect → persist) can skip dispatch + onPersisted on a torn-down
  // reducer instead of crashing on a stale closure.
  const mountedRef = useRef(true)

  const cleanup = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        /* noop */
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
  }, [])

  // Clean up on unmount only — we don't auto-acquire on mount anymore.
  // mountedRef gates async chain steps so they don't dispatch on a torn-down
  // reducer or navigate after the user has already left the route.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  // biome-ignore lint/correctness/useExhaustiveDependencies: handleStopInternal is defined below and closes over stable refs; the loop only fires during recording
  const startVolumeLoop = useCallback(() => {
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
      elapsedMsRef.current = elapsedMs
      const target = Math.min(1, rms * 12)
      const next = prevAmpRef.current * 0.85 + target * 0.15
      prevAmpRef.current = next

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
        void handleStopInternal()
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    // handleStopInternal is closed over below; this loop runs only when
    // recording is live so the forward reference is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const acquireMic = useCallback(async () => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      dispatch({
        type: 'permission-error',
        message: `This page is not in a secure context (${window.location.protocol}//${window.location.host}). Browsers block microphone access outside of https: or http://localhost. Open the app at http://localhost:3000 (not an IP, not a LAN hostname) or over https://.`,
      })
      return
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      dispatch({
        type: 'permission-error',
        message:
          'This browser does not expose navigator.mediaDevices.getUserMedia. Try a current Chrome, Edge, Firefox, or Safari.',
      })
      return
    }
    dispatch({ type: 'request-mic' })
    try {
      const perms = navigator.permissions as Permissions | undefined
      const mic = await perms?.query?.({ name: 'microphone' as PermissionName }).catch(() => null)
      if (mic?.state === 'denied') {
        dispatch({
          type: 'permission-error',
          message: blockedMicPermissionMessage(),
        })
        return
      }
    } catch (err) {
      console.warn('[MirrorSession] microphone permission preflight failed (continuing)', err)
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      analyserRef.current = analyser

      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
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
        // Mid-recording errors (mic revoked, hardware unplugged) fire without
        // a pending stop promise — dispatch a 'fail' directly so the user sees
        // an error panel instead of waiting for a Stop that may never come.
        // `MediaRecorderErrorEvent` is defined by the spec but not always in
        // the bundled lib.dom; narrow to the documented shape locally.
        const err = (ev as Event & { error?: DOMException }).error
        const message = err?.message ?? 'Recorder error.'
        if (mountedRef.current) dispatch({ type: 'fail', message })
        stopPromiseRef.current?.reject(new Error(message))
        stopPromiseRef.current = null
      }
      recorder.start(250)

      startedAtRef.current = performance.now()
      silentSinceRef.current = startedAtRef.current
      dispatch({ type: 'permissions-granted' })
      startVolumeLoop()
    } catch (err) {
      dispatch({ type: 'permission-error', message: friendlyMicError(err) })
    }
  }, [startVolumeLoop])

  const stopRecorder = useCallback((): Promise<Blob> => {
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
  }, [])

  const runPostStopChain = useCallback(
    async (transcript: string) => {
      try {
        if (mountedRef.current) dispatch({ type: 'reflecting' })
        // studentId no longer travels in the data payload — managed-agents
        // resolves it server-side via `requireCounselorContext()` (WorkOS).
        const { output } = await runMirror({ data: { transcript } })
        if (!mountedRef.current) return

        dispatch({ type: 'persisting' })
        const contextType: ContextType = readLastUsedContextType()
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
            // Read elapsed from the ref rather than state.elapsedMs so this
            // callback doesn't reidentify every animation frame and cascade
            // through handleStopInternal / handleVoicePress's useCallback chain.
            trace: { capturedDurationMs: elapsedMsRef.current },
          },
        })
        if (!mountedRef.current) return

        dispatch({ type: 'done' })
        onPersisted?.({
          entryId: result.mirror_entry.id,
          autoConnectorStatus: result.auto_connector_status,
          pendingQueued: result.pending_queued,
        })
      } catch (err) {
        if (!mountedRef.current) return
        const message =
          err instanceof Error ? err.message : 'Something went wrong saving the reflection.'
        dispatch({ type: 'fail', message })
      }
    },
    [studentId, onPersisted],
  )

  const handleStopInternal = useCallback(async () => {
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
      const audioBase64 = await blobToBase64(blob)
      const { transcript } = await transcribeMirror({
        data: { audioBase64, mimeType: blob.type || 'audio/webm' },
      })
      if (!transcript || transcript.trim().length === 0) {
        dispatch({ type: 'fail', message: 'Transcription came back empty. Try again?' })
        return
      }
      dispatch({ type: 'transcribing', transcript })
      cleanup()
      await runPostStopChain(transcript)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong saving the reflection.'
      dispatch({ type: 'fail', message })
      cleanup()
    }
  }, [stopRecorder, studentId, runPostStopChain, cleanup])

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — drives the dev `?inject=` short-circuit straight into the post-Stop chain
  useEffect(() => {
    if (state.phase === 'transcribing' && state.pendingTranscript && rafRef.current == null) {
      // No active recorder when we entered via ?inject — run the chain.
      if (!recorderRef.current) {
        void runPostStopChain(state.pendingTranscript)
      }
    }
  }, [])

  const handleVoicePress = useCallback(() => {
    if (state.phase === 'idle') {
      void acquireMic()
      return
    }
    if (state.phase === 'recording') {
      void handleStopInternal()
    }
    // Other phases: no-op (handler is idempotent).
  }, [state.phase, acquireMic, handleStopInternal])

  const handleMoodTagged = useCallback((mood: Mood) => {
    dispatch({ type: 'mood-tagged', mood })
  }, [])

  const handleReset = useCallback(() => {
    cleanup()
    dispatch({ type: 'reset' })
  }, [cleanup])

  const handleRetryChain = useCallback(() => {
    // Only meaningful when the chain failed AFTER transcribe succeeded —
    // i.e., `pendingTranscript` is held. The reducer also guards this so
    // a stray call from any other phase is a no-op.
    if (state.phase !== 'error' || !state.pendingTranscript) return
    const transcript = state.pendingTranscript
    dispatch({ type: 'retry-chain' })
    void runPostStopChain(transcript)
  }, [state.phase, state.pendingTranscript, runPostStopChain])

  const remainingSec = useMemo(
    () => Math.max(0, Math.ceil((SOFT_TIMEBOX_MS - state.elapsedMs) / 1000)),
    [state.elapsedMs],
  )

  const voiceModeActive =
    state.phase === 'requesting-mic' ||
    state.phase === 'recording' ||
    state.phase === 'transcribing' ||
    state.phase === 'reflecting' ||
    state.phase === 'persisting'

  return {
    phase: state.phase,
    mood: state.mood,
    amplitude: state.amplitude,
    showSoftPrompt: state.showSoftPrompt,
    remainingSec,
    errorMessage: state.errorMessage,
    voiceModeActive,
    canRetryChain: state.phase === 'error' && state.pendingTranscript != null,
    handleVoicePress,
    handleMoodTagged,
    handleRetryChain,
    handleReset,
  }
}

export interface MirrorSessionErrorPanelProps {
  message: string
  /**
   * Reset the state machine to `idle`. Discards any held transcript — use as
   * the "start over" affordance.
   */
  onReset: () => void
  /**
   * Replay the post-Stop chain using the held transcript. Only render this
   * affordance when the host's `canRetryChain` is true, i.e., transcribe
   * succeeded and the failure happened during reflect/persist. Without it,
   * a transient network blip forces the user to re-record.
   */
  onRetryChain?: () => void
}

/** Inline error panel used when the mic flow or chain fails. */
export function MirrorSessionErrorPanel({
  message,
  onReset,
  onRetryChain,
}: MirrorSessionErrorPanelProps) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm"
      data-testid="voice-error-panel"
      role="alert"
    >
      <p className="font-medium">Couldn’t finish the mirror.</p>
      <p className="text-muted-foreground">{message}</p>
      <div className="flex items-center gap-2">
        {onRetryChain ? (
          <Button
            variant="accent"
            size="sm"
            onClick={onRetryChain}
            data-testid="voice-error-retry-chain"
          >
            Retry
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onReset} data-testid="voice-error-start-over">
          {onRetryChain ? 'Start over' : 'Try again'}
        </Button>
      </div>
    </div>
  )
}

export interface VoicePhaseOverlayProps {
  phase: Phase
  remainingSec: number
  showSoftPrompt: boolean
}

/** Thin centered overlay rendered above the world stage during the chain. */
export function VoicePhaseOverlay({ phase, remainingSec, showSoftPrompt }: VoicePhaseOverlayProps) {
  if (phase === 'recording') {
    return (
      <div
        className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2"
        data-testid="voice-phase-overlay"
      >
        <p className="rounded-full bg-background/60 px-3 py-1 text-xs text-muted-foreground">
          listening · {remainingSec}s remaining (or stop whenever)
        </p>
        {showSoftPrompt ? (
          <p
            className="mt-2 rounded-full bg-foreground/85 px-4 py-2 text-center text-xs text-background shadow-lg"
            data-testid="soft-prompt"
          >
            Just talk to yourself, naturally.
          </p>
        ) : null}
      </div>
    )
  }
  if (
    phase === 'transcribing' ||
    phase === 'reflecting' ||
    phase === 'persisting' ||
    phase === 'done'
  ) {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 bottom-24 mx-auto w-fit max-w-sm rounded-lg border border-border bg-background/80 px-4 py-2 shadow-lg"
        data-testid="voice-phase-overlay"
      >
        <p className="text-center text-xs text-muted-foreground" data-testid="phase-label">
          {phaseCopy(phase)}
        </p>
      </div>
    )
  }
  return null
}

function phaseCopy(phase: Phase): string {
  switch (phase) {
    case 'transcribing':
      return 'transcribing what you said…'
    case 'reflecting':
      return 'Mirror is reflecting back…'
    case 'persisting':
      return 'saving to your library…'
    case 'done':
      return 'done. Opening your reflection.'
    default:
      return ''
  }
}

function blockedMicPermissionMessage(): string {
  return [
    'Microphone access is blocked for this site, so the browser will not show a prompt.',
    'Click the lock or site-info icon in the address bar, set Microphone to Allow for this site, then reload the page.',
    'On macOS, also confirm the browser itself is allowed in System Settings -> Privacy & Security -> Microphone.',
  ].join(' ')
}

function friendlyMicError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const raw = err instanceof Error ? err.message : String(err ?? 'unknown error')
  if (name === 'NotAllowedError' || /permission denied|not allowed/i.test(raw)) {
    return [
      'Microphone access was denied without a prompt.',
      'On macOS: open System Settings → Privacy & Security → Microphone, make sure your browser is enabled. Quit and re-open the browser, then refresh.',
      'If the browser already asked once and you said No, click the lock/site-info icon in the address bar and re-allow Microphone for localhost.',
    ].join(' ')
  }
  if (name === 'NotFoundError') {
    return 'No microphone was found on this device.'
  }
  if (name === 'NotReadableError') {
    return 'Microphone is in use by another app. Close the other app and try again.'
  }
  if (name === 'SecurityError') {
    return 'Browser blocked the request because the page is not in a secure context. Try http://localhost:3000 specifically (not 127.0.0.1).'
  }
  return `Could not acquire microphone: ${raw}`
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
      /* noop */
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
  return btoa(binary)
}
