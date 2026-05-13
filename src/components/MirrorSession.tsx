import { useEffect, useReducer, useRef } from 'react'
import { finishAgentRun, startAgentRun } from '~/agents/run-status'
import { demoSignInHref, workosSignInHref } from '~/auth/demo'
import type { ContextType } from '~/components/ContextTypePicker'
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
}

type Action =
  | { type: 'request-permissions' }
  | { type: 'permissions-granted' }
  | { type: 'permission-error'; message: string }
  | { type: 'tick'; elapsedMs: number; amplitude: number }
  | { type: 'opening-silence' }
  | { type: 'stop-pressed' }
  | { type: 'transcribing' }
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
}

function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'request-permissions':
      return { ...state, phase: 'permission-pending', errorMessage: null }
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
  /** True only for legacy pending Connector review rows. */
  stagedDiffPresent: boolean
  /** U7 auto-Connector outcome.
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
  /** Legacy compatibility; Connector no longer waits for user-confirmed diffs. */
  pendingQueued: boolean
}

export interface MirrorSessionProps {
  /**
   * Called after `persistMirror` succeeds. The callback receives the
   * mirror-entry id and the auto-Connector status. The Connector verifies
   * and applies links itself; the caller can route to the raw-thought review
   * filter without waiting on a separate Connector confirmation step.
   */
  onPersisted?: (result: MirrorSessionResult) => void
}

/**
 * Quiet-mirror reflection ritual. Audio-only — captured via
 * MediaRecorder and transcribed by Whisper after Stop. The visible
 * surface is a volume-reactive disc that pulses with the student's
 * own voice.
 *
 * No AI voice during the session. The only in-session prompt is a
 * single soft text line shown once if the student stays silent for
 * the first ~3 seconds.
 */
export function MirrorSession({ onPersisted }: MirrorSessionProps) {
  const [state, dispatch] = useReducer(reduce, initialState)

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
  const mountedRef = useRef(true)
  const phaseRef = useRef<Phase>(initialState.phase)
  const stopInFlightRef = useRef(false)
  const operationTokenRef = useRef(0)

  useEffect(() => {
    phaseRef.current = state.phase
  }, [state.phase])

  // Dev-only seam: ?inject=<transcript> skips media acquisition entirely so
  // headless/automation smoke tests (and humans without a working mic) can
  // drive the rest of the F1 pipeline. Dead-stripped from production builds
  // via `import.meta.env.DEV`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect; cleanup closes over refs that are stable for the lifetime of the component
  useEffect(() => {
    mountedRef.current = true
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const injected = new URLSearchParams(window.location.search).get('inject')
      if (injected && injected.trim().length > 0) {
        const transcript = injected.trim()
        void reflectAndPersist(transcript, inferContextType(transcript), operationTokenRef.current)
      }
    }
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [])

  async function acquire() {
    if (typeof window === 'undefined') return
    console.info('[MirrorSession] acquire() start', {
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol,
      host: window.location.host,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
    })
    if (!window.isSecureContext) {
      dispatch({
        type: 'permission-error',
        message: `This page is not in a secure context (${window.location.protocol}//${window.location.host}). Browsers block microphone access outside of https: or http://localhost. Open the app at http://localhost:3000 (not an IP, not a LAN hostname) or over https://.`,
      })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      dispatch({
        type: 'permission-error',
        message:
          'This browser does not expose navigator.mediaDevices.getUserMedia. Try a current Chrome, Edge, Firefox, or Safari.',
      })
      return
    }
    // Preflight: if the site is already permanently blocked, getUserMedia will
    // reject quickly with NotAllowedError but Chrome may also surface no prompt
    // at all — query the Permissions API first so we can short-circuit with
    // recovery instructions instead of leaving the user staring at a spinner.
    try {
      const perms = navigator.permissions as Permissions | undefined
      if (perms?.query) {
        const mic = await perms.query({ name: 'microphone' as PermissionName }).catch(() => null)
        console.info('[MirrorSession] permission states', { microphone: mic?.state })
        if (mic?.state === 'denied') {
          dispatch({
            type: 'permission-error',
            message: blockedSitePermissionMessage(),
          })
          return
        }
      }
    } catch (err) {
      console.warn('[MirrorSession] permission preflight failed (continuing)', err)
    }
    try {
      console.info('[MirrorSession] calling getUserMedia…')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.info('[MirrorSession] getUserMedia resolved', {
        tracks: stream.getTracks().map((t) => `${t.kind}:${t.label}`),
      })
      if (!mountedRef.current) {
        stopStream(stream)
        return
      }
      streamRef.current = stream

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
        if (stopPromiseRef.current) {
          stopPromiseRef.current.reject(new Error(message))
          stopPromiseRef.current = null
          return
        }
        failRecording(message)
      }
      recorder.start(250)

      startedAtRef.current = performance.now()
      silentSinceRef.current = startedAtRef.current
      dispatch({ type: 'permissions-granted' })

      startVolumeLoop()
    } catch (err) {
      failRecording(friendlyMediaError(err), 'permission-error')
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
        void requestStop()
        return
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  function handleStart() {
    if (state.phase !== 'idle') return
    operationTokenRef.current += 1
    dispatch({ type: 'request-permissions' })
    void acquire()
  }

  function cleanup({ invalidate = true }: { invalidate?: boolean } = {}) {
    if (invalidate) {
      operationTokenRef.current += 1
      stopInFlightRef.current = false
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const pendingStop = stopPromiseRef.current
    stopPromiseRef.current = null
    pendingStop?.reject(new Error('Recording stopped.'))

    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.onerror = null
    }
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
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
    analyserRef.current = null
    startedAtRef.current = null
    silentSinceRef.current = null
    softPromptFiredRef.current = false
    chunksRef.current = []
  }

  function failRecording(message: string, type: 'permission-error' | 'fail' = 'fail') {
    cleanup()
    if (!mountedRef.current) return
    dispatch(
      type === 'permission-error'
        ? { type: 'permission-error', message }
        : { type: 'fail', message },
    )
  }

  function isCurrentOperation(token: number) {
    return mountedRef.current && operationTokenRef.current === token
  }

  async function handleStop() {
    await requestStop()
  }

  async function requestStop() {
    if (
      stopInFlightRef.current ||
      (phaseRef.current !== 'recording' && phaseRef.current !== 'permission-pending')
    ) {
      return
    }

    stopInFlightRef.current = true
    const token = operationTokenRef.current

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    dispatch({ type: 'stop-pressed' })

    try {
      const blob = await stopRecorder()
      if (!isCurrentOperation(token)) return

      cleanup({ invalidate: false })

      if (blob.size === 0) {
        dispatch({
          type: 'fail',
          message: 'No audio was captured. Try again, and remember to allow microphone access.',
        })
        return
      }

      dispatch({ type: 'transcribing' })
      const audioBase64 = await blobToBase64(blob)
      if (!isCurrentOperation(token)) return

      const { transcript } = await transcribeMirror({
        data: { audioBase64, mimeType: blob.type || 'audio/webm' },
      })
      if (!isCurrentOperation(token)) return

      if (!transcript || transcript.trim().length === 0) {
        dispatch({ type: 'fail', message: 'Transcription came back empty. Try again?' })
        return
      }

      await reflectAndPersist(transcript, inferContextType(transcript), token)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong saving the reflection.'
      if (isCurrentOperation(token)) dispatch({ type: 'fail', message })
    } finally {
      // Release media stream regardless of branch — recorder is already stopped.
      // The Mirror agent + persistMirror run server-side after transcription;
      // no audio is needed beyond this point.
      if (isCurrentOperation(token)) cleanup({ invalidate: false })
      stopInFlightRef.current = false
    }
  }

  async function reflectAndPersist(
    transcript: string,
    contextType: ContextType,
    token = operationTokenRef.current,
  ) {
    let activeAgent: 'mirror' | 'connector' | null = null
    try {
      activeAgent = 'mirror'
      startAgentRun('mirror', 'Reflecting the transcript back to the student.')
      dispatch({ type: 'reflecting' })
      const { output } = await runMirror({ data: { transcript } })
      finishAgentRun('mirror', 'succeeded', 'Mirror output is ready.')
      activeAgent = null
      if (!isCurrentOperation(token)) return

      activeAgent = 'connector'
      startAgentRun('connector', 'Saving the reflection and checking for VIPS library updates.')
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
          trace: {
            capturedDurationMs: state.elapsedMs,
            inferredContextType: contextType,
          },
        },
      })
      finishAgentRun(
        'connector',
        statusForConnectorResult(result.auto_connector_status),
        detailForConnectorResult(result.auto_connector_status),
      )
      activeAgent = null
      if (!isCurrentOperation(token)) return

      dispatch({ type: 'done' })
      onPersisted?.({
        entryId: result.mirror_entry.id,
        stagedDiffPresent: result.staged_diff?.status === 'pending',
        autoConnectorStatus: result.auto_connector_status,
        pendingQueued: result.pending_queued,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong saving the reflection.'
      if (activeAgent) {
        finishAgentRun(activeAgent, 'failed', message)
      }
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
        stopPromiseRef.current = null
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const remainingMs = Math.max(0, SOFT_TIMEBOX_MS - state.elapsedMs)
  const remainingSec = Math.ceil(remainingMs / 1000)
  const ringScale = 1 + state.amplitude * 0.18

  if (state.phase === 'error') {
    const authError = isAuthErrorMessage(state.errorMessage)
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-warning/40 bg-warning/10 p-6 text-sm">
        <p className="font-medium">Couldn’t start the mirror.</p>
        <p className="text-muted-foreground">{state.errorMessage}</p>
        <div className="flex flex-wrap gap-2">
          {authError ? (
            <>
              <form action={demoSignInHref('/reflect')} method="post">
                <Button type="submit" size="sm">
                  Try demo account
                </Button>
              </form>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = workosSignInHref('/reflect')
                }}
              >
                Sign in
              </Button>
            </>
          ) : null}
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
      </div>
    )
  }

  const discScale = 1 + state.amplitude * 0.45
  const isLive = state.phase === 'recording' || state.phase === 'permission-pending'
  return (
    <div className="flex flex-col items-center gap-6">
      <div
        className="relative flex aspect-square w-full max-w-md items-center justify-center overflow-hidden rounded-2xl bg-muted/30"
        data-testid="mirror-frame"
      >
        {/* Outer volume-reactive ring */}
        <div
          className="pointer-events-none absolute inset-6 rounded-full ring-2 ring-accent/40 transition-transform duration-100 ease-out"
          style={{ transform: `scale(${ringScale})` }}
          aria-hidden
        />
        {/* Inner pulsing disc */}
        <div
          className="pointer-events-none h-32 w-32 rounded-full bg-accent/70 transition-transform duration-100 ease-out"
          style={{
            transform: `scale(${discScale})`,
            opacity: isLive ? 0.85 : 0.35,
          }}
          aria-hidden
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
        <div className="flex items-center gap-3">
          {state.phase === 'idle' ? (
            <Button size="sm" onClick={handleStart} data-testid="start-button">
              Start mirror
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleStop()}
              disabled={state.phase !== 'recording'}
              data-testid="stop-button"
            >
              Stop and reflect
            </Button>
          )}
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
  if (phase === 'reflecting')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        Mirror is reflecting back…
      </p>
    )
  if (phase === 'persisting')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        saving to your library + checking Connector…
      </p>
    )
  if (phase === 'done')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        done. Opening your reflection.
      </p>
    )
  if (phase === 'permission-pending')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        granting microphone…
      </p>
    )
  if (phase === 'idle')
    return (
      <p className="text-xs text-muted-foreground" data-testid="phase-label">
        click start when you’re ready — your browser will ask for microphone access.
      </p>
    )
  return null
}

function statusForConnectorResult(
  status: MirrorSessionResult['autoConnectorStatus'],
): 'succeeded' | 'queued' | 'failed' {
  if (status === 'ok') return 'succeeded'
  if (status === 'queued') return 'queued'
  return 'failed'
}

function detailForConnectorResult(status: MirrorSessionResult['autoConnectorStatus']): string {
  switch (status) {
    case 'ok':
      return 'Connector verified and linked this thought into the library mesh.'
    case 'queued':
      return 'Connector queued behind an older run.'
    case 'timeout':
      return 'Connector timed out; the raw thought was still saved.'
    case 'schema_reject':
      return 'Connector returned an invalid diff; the raw thought was still saved.'
    case 'transport_error':
      return 'Connector transport failed; the raw thought was still saved.'
    case 'auth_error':
      return 'Connector auth failed; the raw thought was still saved.'
    case 'missing_mirror':
      return 'Connector could not find the saved mirror entry.'
    case 'unknown':
      return 'Connector failed for an unknown reason; the raw thought was still saved.'
  }
}

function blockedSitePermissionMessage(): string {
  return [
    'Microphone access is blocked for this site, so the browser will not show a prompt.',
    'Click the lock or site-info icon in the address bar, set Microphone to Allow for this site, then reload the page.',
    'On macOS, also confirm the browser itself is allowed in System Settings → Privacy & Security → Microphone.',
  ].join(' ')
}

function friendlyMediaError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const raw = err instanceof Error ? err.message : String(err ?? 'unknown error')
  if (name === 'NotAllowedError' || /permission denied|not allowed/i.test(raw)) {
    return [
      'Microphone access was denied without a prompt.',
      'On macOS: open System Settings → Privacy & Security → Microphone, make sure your browser is enabled. Quit and re-open the browser, then refresh.',
      'If the browser already asked once and you said No, click the lock/site-info icon in the address bar and re-allow Microphone for this site.',
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

function isAuthErrorMessage(message: string | null): boolean {
  return !!message && /not authenticated|sign in|authkit middleware/i.test(message)
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

export function inferContextType(transcript: string): ContextType {
  const text = transcript.toLowerCase()
  const scores: Record<ContextType, number> = {
    school: scoreContext(text, [
      'school',
      'class',
      'lesson',
      'teacher',
      'homework',
      'assignment',
      'exam',
      'test',
      'grade',
      'subject',
      'math',
      'science',
      'english',
      'cca',
    ]),
    family: scoreContext(text, [
      'family',
      'home',
      'parent',
      'parents',
      'mum',
      'mom',
      'mother',
      'dad',
      'father',
      'sibling',
      'brother',
      'sister',
      'grandparent',
    ]),
    peer: scoreContext(text, [
      'friend',
      'friends',
      'classmate',
      'classmates',
      'group chat',
      'hang out',
      'hangout',
      'team mate',
      'teammate',
      'peer',
    ]),
    hobby: scoreContext(text, [
      'hobby',
      'side project',
      'project',
      'game',
      'gaming',
      'music',
      'drawing',
      'art',
      'sport',
      'coding',
      'build',
      'practice',
      'club',
    ]),
    civic: scoreContext(text, [
      'civic',
      'community',
      'volunteer',
      'service',
      'neighbourhood',
      'neighborhood',
      'charity',
      'society',
      'public',
      'council',
    ]),
  }

  return (Object.entries(scores) as Array<[ContextType, number]>).reduce<ContextType>(
    (best, [context, score]) => (score > scores[best] ? context : best),
    'school',
  )
}

function scoreContext(text: string, keywords: string[]): number {
  return keywords.reduce((score, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = keyword.includes(' ')
      ? new RegExp(escaped, 'g')
      : new RegExp(`\\b${escaped}\\b`, 'g')
    return score + (text.match(pattern)?.length ?? 0)
  }, 0)
}
