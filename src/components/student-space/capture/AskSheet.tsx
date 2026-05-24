import { Image as ImageIcon, Mic, Send, Smile, Type } from 'lucide-react'
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '~/components/ui/drawer'
import { kiraReplyFor } from '~/engine/student-space/Game/View/chatHeuristics.js'
import { reframeFor } from '~/engine/student-space/Game/View/reframeHeuristics.js'
import {
  blobToStudentSpaceAudioBase64,
  canRecordStudentSpaceAudio,
  startStudentSpaceAudioCapture,
} from '~/lib/student-space/audio-capture'
import {
  EMOTION_BY_ID,
  EMOTIONS,
  type EmotionEntry,
  shapeDataUri,
} from '~/lib/student-space/mood-shapes'
import { canCreateRealtimeMirrorCapture } from '~/lib/student-space/realtime-mirror-client'
import { useEngine } from '~/lib/student-space/use-engine'
import { useEngineOverlay } from '~/lib/student-space/use-engine-overlay'
import { cn } from '~/lib/utils'

type Stage = 'compose' | 'recording' | 'review' | 'reframe' | 'chat'
type Reframe = {
  headline?: string
  highlightPhrase?: string
  themes?: string[]
  needs?: string[]
  moods?: string[]
  edited?: boolean
  backend?: boolean
}
type ThreadMessage = { role: 'kira' | 'you'; text: string }
type LiveMessage = {
  id?: string
  role?: string
  text?: string
  status?: 'streaming' | 'final' | 'discarded' | string
}
type CaptureEntry = {
  id?: string
  kind?: string
  text?: string
  prompt?: string | null
  dataUrl?: string | null
  reframe?: Reframe | null
  thread?: ThreadMessage[] | null
  letterId?: string | null
}
type PreparedReflection = {
  localCaptureId?: string
  transcript?: string
  validation?: string
  inferredMeaning?: string
  storyReframe?: string
  contextType?: string
  mood?: string
  transcription?: unknown
}
type RealtimeCapture = {
  stop?: () => Promise<PreparedReflection>
  abort?: () => void
}
type AudioCapture = {
  stop?: () => Promise<Blob>
  abort?: () => void
  mimeType?: string
}

type Vec3Like = {
  x: number
  y: number
  z: number
  constructor: new (x: number, y: number, z: number) => Vec3Like
}
type CameraInstance = {
  zoomTo?: (pos: Vec3Like, look: Vec3Like, duration?: number, opts?: { owner?: string }) => void
  restoreZoom?: (duration?: number, opts?: { owner?: string }) => void
}
type KiraActor = {
  group?: { position?: Vec3Like; rotation?: { y: number } }
  facing?: number
}
type KiraCameraView = {
  camera?: CameraInstance & { instance?: { position?: Vec3Like } }
  kira?: KiraActor
  captureFocus?: boolean
}

type GameWithAsk = {
  state?: {
    captures?: {
      add?: (entry: Record<string, unknown>) => CaptureEntry
      patch?: (id: string, updates: Record<string, unknown>) => CaptureEntry | null
    }
    backend?: {
      createRealtimeMirrorCapture?: (input: Record<string, unknown>) => Promise<RealtimeCapture>
      prepareReflection?: (input: Record<string, unknown>) => Promise<PreparedReflection>
      transcribeReflectionAudio?: (
        input: Record<string, unknown>,
      ) => Promise<{ transcript?: string }>
      logPreparedReflection?: (input: PreparedReflection) => Promise<{
        mirrorEntry?: {
          id?: string | number
          transcript?: string
          validation?: string
          storyReframe?: string
          inferredMeaning?: string
          contextType?: string
          reviewStatus?: string
        }
      }>
      forgetPreparedReflection?: (input: PreparedReflection) => Promise<unknown>
      submitReflection?: (input: Record<string, unknown>) => Promise<{
        mirrorEntry?: {
          id?: string | number
          transcript?: string
          storyReframe?: string
          inferredMeaning?: string
          reviewStatus?: string
        }
      }>
    }
    letters?: { letters?: Array<{ id: string; from?: string; subject?: string }> }
  }
  view?: { overlayController?: { noteClosed?: (name: string) => void } }
}

const THEME_PILL: Record<string, { label: string; need: string; mood: string }> = {
  school: { label: 'school', need: 'autonomy', mood: 'anxiety' },
  sleep: { label: 'sleep', need: 'rest', mood: 'ennui' },
  friend: { label: 'friends', need: 'belonging', mood: 'joy' },
  family: { label: 'family', need: 'belonging', mood: 'joy' },
  play: { label: 'play', need: 'agency', mood: 'joy' },
  scroll: { label: 'the phone', need: 'stillness', mood: 'anxiety' },
}

function canUseSpeechRecognition() {
  if (typeof window === 'undefined') return false
  return Boolean(
    (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
      .SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition,
  )
}

function friendlyMicError(message: string) {
  if (/permission denied|not allowed|NotAllowedError/i.test(message))
    return 'Mic permission denied. Type instead.'
  if (/not found|NotFoundError/i.test(message)) return 'No microphone was found. Type instead.'
  return `Could not start mic: ${message}`
}

function preparedToReframe(prepared: PreparedReflection): Reframe {
  return {
    headline: [prepared.storyReframe, prepared.validation, prepared.inferredMeaning]
      .filter(Boolean)
      .join('\n\n'),
    highlightPhrase: prepared.transcript || '',
    themes: prepared.contextType ? [prepared.contextType] : [],
    needs: [],
    moods: prepared.mood ? [prepared.mood] : [],
    backend: true,
  }
}

function readImageAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) reject(new Error('Could not read that image.'))
      else resolve(dataUrl)
    }
    reader.readAsDataURL(file)
  })
}

export function AskSheet() {
  const engine = useEngine() as GameWithAsk | null
  const overlay = useEngineOverlay()
  const open = overlay.activeCapture === 'ask'
  const options = open ? overlay.activeCaptureOptions : null
  const prompt = (options?.prompt as string | undefined) ?? null
  const letterId = (options?.letterId as string | undefined) ?? null
  const readOnly = Boolean(options?.readOnly)
  const dismissOnBack = Boolean(options?.dismissOnBack)
  const capture = options?.capture as CaptureEntry | undefined
  const prefilledText = (options?.prefilledText as string | undefined) ?? ''
  const backend = engine?.state?.backend
  const captures = engine?.state?.captures

  const [stage, setStage] = useState<Stage>('compose')
  const [text, setText] = useState('')
  const [hint, setHint] = useState('')
  const [liveHint, setLiveHint] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [selectedMood, setSelectedMood] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState<string | null>(null)
  const [recordedAudioBlob, setRecordedAudioBlob] = useState<Blob | null>(null)
  const [recordedAudioMimeType, setRecordedAudioMimeType] = useState<string | null>(null)
  const [liveDialogue, setLiveDialogue] = useState<LiveMessage[]>([])
  const [preparedReflection, setPreparedReflection] = useState<PreparedReflection | null>(null)
  const [prepareInFlight, setPrepareInFlight] = useState(false)
  const [logInFlight, setLogInFlight] = useState(false)
  const [reframe, setReframe] = useState<Reframe | null>(null)
  const [thread, setThread] = useState<ThreadMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [reframeActionMode, setReframeActionMode] = useState<
    'offline' | 'preparing' | 'ready' | 'failed' | 'logging'
  >('offline')
  const [pendingLocalCaptureId, setPendingLocalCaptureId] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const audioCaptureRef = useRef<AudioCapture | null>(null)
  const realtimeCaptureRef = useRef<RealtimeCapture | null>(null)
  const focusTimeoutRef = useRef<number | null>(null)
  const liveDialogueRef = useRef<HTMLDivElement | null>(null)
  const liveDialogueEndRef = useRef<HTMLDivElement | null>(null)
  const mountedRef = useRef(false)
  const openRef = useRef(open)
  const recordingRunRef = useRef(0)
  const workflowRunRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      recordingRunRef.current += 1
      if (focusTimeoutRef.current != null) window.clearTimeout(focusTimeoutRef.current)
      focusTimeoutRef.current = null
      audioCaptureRef.current?.abort?.()
      realtimeCaptureRef.current?.abort?.()
      audioCaptureRef.current = null
      realtimeCaptureRef.current = null
    }
  }, [])

  const setAudioCaptureHandle = useCallback((next: AudioCapture | null) => {
    audioCaptureRef.current = next
  }, [])

  const setRealtimeCaptureHandle = useCallback((next: RealtimeCapture | null) => {
    realtimeCaptureRef.current = next
  }, [])

  const abortRecording = useCallback(() => {
    recordingRunRef.current += 1
    setListening(false)
    audioCaptureRef.current?.abort?.()
    realtimeCaptureRef.current?.abort?.()
    setAudioCaptureHandle(null)
    setRealtimeCaptureHandle(null)
  }, [setAudioCaptureHandle, setRealtimeCaptureHandle])

  useEffect(() => {
    openRef.current = open
    if (!open) {
      workflowRunRef.current += 1
      abortRecording()
      setPrepareInFlight(false)
      setLogInFlight(false)
    }
  }, [abortRecording, open])

  const letter = useMemo(() => {
    if (!letterId) return null
    return engine?.state?.letters?.letters?.find((item) => item.id === letterId) ?? null
  }, [engine, letterId])

  const hasComposerInput = Boolean(text.trim() || selectedMood || uploadedImageDataUrl)

  useEffect(() => {
    if (!open) return
    workflowRunRef.current += 1
    setHint('')
    setLiveHint('')
    setSelectedMood(null)
    setEmojiOpen(false)
    setUploadedImageDataUrl(readOnly && capture?.dataUrl ? capture.dataUrl : null)
    setRecordedAudioBlob(null)
    setRecordedAudioMimeType(null)
    setAudioCaptureHandle(null)
    setRealtimeCaptureHandle(null)
    setLiveDialogue([])
    setPreparedReflection(null)
    setPrepareInFlight(false)
    setLogInFlight(false)
    setReframe(capture?.reframe ?? null)
    setThread(Array.isArray(capture?.thread) ? capture.thread.slice() : [])
    setChatInput('')
    setPendingLocalCaptureId(null)
    setListening(false)
    setReframeActionMode('offline')
    const initialText = readOnly && capture?.text ? capture.text : prefilledText
    setText(initialText)
    setReviewText(readOnly && capture?.text ? capture.text : '')
    setStage(readOnly && capture ? 'review' : 'compose')
    if (focusTimeoutRef.current != null) window.clearTimeout(focusTimeoutRef.current)
    if (!readOnly) {
      focusTimeoutRef.current = window.setTimeout(() => {
        focusTimeoutRef.current = null
        textareaRef.current?.focus()
      }, 140)
    }
  }, [capture, open, prefilledText, readOnly, setAudioCaptureHandle, setRealtimeCaptureHandle])

  // Camera dolly toward Kira + freeze her wander while Capture is open.
  // Uses a slightly wider composition than the first-chat framing so her face
  // stays visible above the capture sheet. Restores on close.
  useEffect(() => {
    if (!open) return
    const view = (engine as unknown as { view?: KiraCameraView } | null)?.view
    const camera = view?.camera
    const kiraActor = view?.kira
    const kira = kiraActor?.group?.position
    if (!camera?.zoomTo || !kira) return
    const Vec = kira.constructor as new (x: number, y: number, z: number) => Vec3Like
    const liveCam = camera.instance?.position
    const dx = (liveCam?.x ?? kira.x) - kira.x
    const dz = (liveCam?.z ?? kira.z + 1) - kira.z
    const flat = Math.hypot(dx, dz) || 1
    const unitX = dx / flat
    const unitZ = dz / flat
    const targetYaw = Math.atan2(-unitZ, unitX)
    const camPos: Vec3Like = new Vec(kira.x + unitX * 4.2, kira.y + 1.05, kira.z + unitZ * 4.2)
    const camLook: Vec3Like = new Vec(kira.x, kira.y + 0.72, kira.z)
    const rotation = kiraActor?.group?.rotation
    const initialYaw = rotation?.y
    let yawFrame: number | null = null
    let cancelled = false
    const setKiraYaw = (yaw: number) => {
      if (!rotation) return
      rotation.y = yaw
      if (kiraActor) kiraActor.facing = yaw
    }
    const animateKiraYaw = (to: number, duration: number) => {
      if (!rotation) return
      const from = rotation.y
      const startedAt = performance.now()
      const tick = (now: number) => {
        if (cancelled) return
        const t = Math.min(1, Math.max(0, (now - startedAt) / duration))
        const eased = t * t * (3 - 2 * t)
        let delta = to - from
        delta = ((delta + Math.PI * 3) % (Math.PI * 2)) - Math.PI
        setKiraYaw(from + delta * eased)
        if (t < 1) yawFrame = window.requestAnimationFrame(tick)
      }
      yawFrame = window.requestAnimationFrame(tick)
    }
    camera.zoomTo(camPos, camLook, 700, { owner: 'capture' })
    animateKiraYaw(targetYaw, 700)
    if (view) view.captureFocus = true
    return () => {
      cancelled = true
      if (yawFrame != null) window.cancelAnimationFrame(yawFrame)
      camera.restoreZoom?.(620, { owner: 'capture' })
      if (typeof initialYaw === 'number') setKiraYaw(initialYaw)
      if (view) view.captureFocus = false
    }
  }, [open, engine])

  function noteClosed() {
    engine?.view?.overlayController?.noteClosed?.('ask')
  }

  function close() {
    workflowRunRef.current += 1
    abortRecording()
    overlay.closeCapture()
    noteClosed()
  }

  function onBack() {
    if (!open) return
    if (readOnly || dismissOnBack) {
      close()
      return
    }
    if (prepareInFlight || preparedReflection || stage === 'reframe') {
      void forgetDraft()
      return
    }
    close()
  }

  function composeText() {
    const trimmed = text.trim()
    if (trimmed) return trimmed
    if (selectedMood) {
      const emotion = EMOTION_BY_ID[selectedMood]
      return `I feel ${emotion?.label?.toLowerCase?.() || selectedMood}.`
    }
    if (uploadedImageDataUrl) return 'I added a picture for this reflection.'
    return ''
  }

  function ensureDraftCaptureId() {
    if (pendingLocalCaptureId) return pendingLocalCaptureId
    const id = `ask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    setPendingLocalCaptureId(id)
    return id
  }

  function saveTyped() {
    const nextText = composeText()
    if (!nextText) return
    setReviewText(nextText)
    setStage('review')
  }

  async function startRecording() {
    const runId = recordingRunRef.current + 1
    recordingRunRef.current = runId
    const useRealtimeVoice = Boolean(
      backend?.createRealtimeMirrorCapture && canCreateRealtimeMirrorCapture(),
    )
    if ((!useRealtimeVoice && !canRecordStudentSpaceAudio()) || listening) return
    setListening(true)
    setHint('')
    setLiveHint('')
    setLiveDialogue([])
    const seed = text.trim()
    setReviewText(seed)
    setStage('recording')
    if (seed)
      setLiveDialogue([{ id: 'typed-preface', role: 'student', text: seed, status: 'final' }])

    try {
      if (useRealtimeVoice) {
        const session = await backend?.createRealtimeMirrorCapture?.({
          localCaptureId: ensureDraftCaptureId(),
          ...(seed ? { initialTranscript: seed } : {}),
          contextType: 'school',
          ...(selectedMood ? { mood: selectedMood } : {}),
          onConversationUpdate: (message: LiveMessage) => {
            if (!mountedRef.current || recordingRunRef.current !== runId) return
            setLiveDialogue((items) => {
              const id = message.id || `${message.role || 'student'}-${Date.now()}`
              if (message.status === 'discarded') return items.filter((item) => item.id !== id)
              const next = items.filter((item) => item.id !== id)
              next.push({ ...message, id })
              return next
            })
            if (message.role === 'student' && message.status === 'final' && message.text) {
              setReviewText((current) => [current, message.text].filter(Boolean).join(' ').trim())
            }
          },
        })
        if (!mountedRef.current || recordingRunRef.current !== runId) {
          session?.abort?.()
          return
        }
        setRealtimeCaptureHandle(session ?? null)
        return
      }

      const captureSession = (await startStudentSpaceAudioCapture()) as AudioCapture
      if (!mountedRef.current || recordingRunRef.current !== runId) {
        captureSession.abort?.()
        return
      }
      setAudioCaptureHandle(captureSession)
      setRecordedAudioMimeType(captureSession.mimeType ?? 'audio/webm')
      if (backend?.transcribeReflectionAudio)
        setLiveHint('OpenAI will transcribe this when you stop.')
      else if (!canUseSpeechRecognition())
        setLiveHint('Recording audio. Type a few words too if you want a transcript now.')
    } catch (err) {
      if (!mountedRef.current || recordingRunRef.current !== runId) return
      setListening(false)
      setAudioCaptureHandle(null)
      realtimeCaptureRef.current?.abort?.()
      setRealtimeCaptureHandle(null)
      const message = err instanceof Error ? err.message : String(err)
      setHint(friendlyMicError(message))
      setStage('compose')
    }
  }

  async function stopRecording() {
    if (!listening) return
    const runId = recordingRunRef.current
    setListening(false)

    const liveRealtimeCapture = realtimeCaptureRef.current
    if (liveRealtimeCapture) {
      const session = liveRealtimeCapture
      setRealtimeCaptureHandle(null)
      setPrepareInFlight(true)
      setPreparedReflection(null)
      setReframe({
        headline: 'Mirroring and summarising the session.',
        highlightPhrase: reviewText || 'Voice reflection',
        themes: [],
        needs: [],
        moods: selectedMood ? [selectedMood] : ['ennui'],
      })
      setReframeActionMode('preparing')
      setStage('reframe')
      try {
        const prepared = await session.stop?.()
        if (!mountedRef.current || recordingRunRef.current !== runId) return
        setPrepareInFlight(false)
        if (!prepared) throw new Error('Realtime Mirror returned no reading.')
        setPreparedReflection(prepared)
        const transcript = prepared.transcript || reviewText
        setReviewText(transcript)
        setReframe(preparedToReframe(prepared))
        setReframeActionMode('ready')
      } catch (err) {
        if (!mountedRef.current || recordingRunRef.current !== runId) return
        const message = err instanceof Error ? err.message : String(err)
        setPrepareInFlight(false)
        setPreparedReflection(null)
        setReframe({
          headline: `Could not prepare this reading yet. ${message}`,
          highlightPhrase: reviewText || 'Voice reflection',
          themes: [],
          needs: [],
          moods: ['ennui'],
        })
        setReframeActionMode('failed')
      }
      return
    }

    try {
      const blob = await audioCaptureRef.current?.stop?.()
      if (!mountedRef.current || recordingRunRef.current !== runId) return
      setAudioCaptureHandle(null)
      if (!blob || blob.size === 0) {
        setHint('No audio was captured. Try again or type it.')
        setStage('compose')
        return
      }
      setRecordedAudioBlob(blob)
      setRecordedAudioMimeType(blob.type || recordedAudioMimeType || 'audio/webm')
      const nextText = reviewText || text.trim()
      setReviewText(nextText || 'Audio recorded. Transcript will appear after Mirror listens.')
      setStage('review')
    } catch (err) {
      if (!mountedRef.current || recordingRunRef.current !== runId) return
      setHint(err instanceof Error ? err.message : 'Could not stop recording.')
      setStage('compose')
    }
  }

  async function prepareMirrorDraft() {
    const runId = workflowRunRef.current
    let nextText = (reviewText || composeText()).trim()
    const audioBlob = recordedAudioBlob
    if (!nextText && !audioBlob) {
      setHint("Didn't catch anything. Try again or type it.")
      setStage('compose')
      return
    }
    if (!backend?.prepareReflection || prepareInFlight) {
      const offline = reframeFor(nextText)
      setReframe({ ...offline, edited: reframe?.edited === true })
      setReframeActionMode('offline')
      setStage('reframe')
      return
    }

    setPrepareInFlight(true)
    setPreparedReflection(null)
    setReframe({
      headline: audioBlob ? 'Listening to the recording.' : 'Reading this back carefully.',
      highlightPhrase: nextText || 'Voice recording',
      themes: [],
      needs: [],
      moods: ['ennui'],
    })
    setReframeActionMode('preparing')
    setStage('reframe')

    try {
      let audioBase64: string | null = null
      let transcription: { transcript?: string } | null = null
      if (audioBlob) audioBase64 = await blobToStudentSpaceAudioBase64(audioBlob)
      if (!isLiveWorkflow(runId)) return
      if (audioBase64 && backend.transcribeReflectionAudio) {
        transcription = await backend.transcribeReflectionAudio({
          audioBase64,
          mimeType: recordedAudioMimeType || audioBlob?.type || 'audio/webm',
        })
        if (!isLiveWorkflow(runId)) return
        const transcript = transcription?.transcript?.trim() ?? ''
        if (!transcript) throw new Error('OpenAI transcription came back empty.')
        nextText = transcript
        setReviewText(transcript)
      }
      const prepared = await backend.prepareReflection({
        localCaptureId: ensureDraftCaptureId(),
        ...(audioBase64 && !transcription
          ? { audioBase64, mimeType: recordedAudioMimeType || audioBlob?.type || 'audio/webm' }
          : { transcript: nextText }),
        contextType: 'school',
        ...(selectedMood ? { mood: selectedMood } : {}),
      })
      if (!isLiveWorkflow(runId)) return
      const preparedForLog = transcription
        ? { ...prepared, transcription: prepared.transcription || transcription }
        : prepared
      setPrepareInFlight(false)
      setPreparedReflection(preparedForLog)
      setReviewText(preparedForLog.transcript || nextText)
      setReframe(preparedToReframe(preparedForLog))
      setReframeActionMode('ready')
    } catch (err) {
      if (!isLiveWorkflow(runId)) return
      const message = err instanceof Error ? err.message : String(err)
      setPrepareInFlight(false)
      setPreparedReflection(null)
      setReframe({
        headline: `Could not prepare this reading yet. ${message}`,
        highlightPhrase: nextText || 'Voice recording',
        themes: [],
        needs: [],
        moods: ['ennui'],
      })
      setReframeActionMode('failed')
    }
  }

  function commitCapture(payload: Record<string, unknown>, options: Record<string, unknown> = {}) {
    const entry: Record<string, unknown> = {
      kind: 'ask',
      prompt,
      syncStatus: backend?.submitReflection ? 'syncing' : 'local',
      ...(uploadedImageDataUrl ? { dataUrl: uploadedImageDataUrl } : {}),
      ...(letterId ? { letterId } : {}),
      ...payload,
    }
    if (!entry.reframe) delete entry.reframe
    if (!entry.thread || (Array.isArray(entry.thread) && entry.thread.length === 0))
      delete entry.thread
    const captureEntry = captures?.add?.(entry)
    if (captureEntry && backend?.submitReflection) {
      void submitBackendReflection(captureEntry, options)
    }
  }

  async function submitBackendReflection(
    captureEntry: CaptureEntry,
    options: Record<string, unknown>,
  ) {
    try {
      const audioBlob = options.audioBlob as Blob | undefined
      let audioBase64: string | null = null
      if (audioBlob) audioBase64 = await blobToStudentSpaceAudioBase64(audioBlob)
      const result = await backend?.submitReflection?.({
        localCaptureId: captureEntry.id,
        ...(audioBase64
          ? { audioBase64, mimeType: options.mimeType || audioBlob?.type || 'audio/webm' }
          : { transcript: captureEntry.text || '' }),
        contextType: 'school',
        ...(selectedMood ? { mood: selectedMood } : {}),
      })
      const mirror = result?.mirrorEntry
      if (!mirror || !captureEntry.id) return
      captures?.patch?.(captureEntry.id, {
        backendMirrorEntryId: mirror.id,
        text: mirror.transcript || captureEntry.text || '',
        reviewStatus: mirror.reviewStatus || 'pending',
        syncStatus: 'synced',
        syncError: '',
        reframe: {
          headline: mirror.storyReframe || '',
          highlightPhrase: mirror.inferredMeaning || '',
          themes: [],
          needs: [],
          moods: [],
        },
      })
    } catch (err) {
      if (!captureEntry.id) return
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[AskSheet] backend reflection submit failed', err)
      captures?.patch?.(captureEntry.id, { syncStatus: 'failed', syncError: message })
    }
  }

  async function logPreparedReframe() {
    if (logInFlight || !preparedReflection) return
    const runId = workflowRunRef.current
    setLogInFlight(true)
    setReframeActionMode('logging')
    const captureEntry = captures?.add?.({
      id: preparedReflection.localCaptureId,
      kind: 'ask',
      prompt,
      text: preparedReflection.transcript || '',
      reframe,
      syncStatus: backend?.logPreparedReflection ? 'syncing' : 'local',
      contextType: preparedReflection.contextType || 'school',
      ...(uploadedImageDataUrl ? { dataUrl: uploadedImageDataUrl } : {}),
      ...(letterId ? { letterId } : {}),
    })
    if (!backend?.logPreparedReflection) {
      close()
      return
    }
    try {
      const result = await backend.logPreparedReflection(preparedReflection)
      const mirror = result?.mirrorEntry
      if (!isLiveWorkflow(runId)) return
      if (mirror && captureEntry?.id) {
        captures?.patch?.(captureEntry.id, {
          backendMirrorEntryId: mirror.id,
          text: mirror.transcript || captureEntry.text || '',
          reviewStatus: mirror.reviewStatus || 'pending',
          syncStatus: 'synced',
          syncError: '',
          contextType: mirror.contextType || 'school',
          reframe: {
            headline: [mirror.storyReframe, mirror.validation, mirror.inferredMeaning]
              .filter(Boolean)
              .join('\n\n'),
            highlightPhrase: mirror.transcript || '',
            themes: mirror.contextType ? [mirror.contextType] : [],
            needs: [],
            moods: [],
          },
        })
      }
      close()
    } catch (err) {
      if (!isLiveWorkflow(runId)) return
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[AskSheet] prepared reflection log failed', err)
      if (captureEntry?.id)
        captures?.patch?.(captureEntry.id, { syncStatus: 'failed', syncError: message })
      close()
    }
  }

  async function forgetDraft() {
    workflowRunRef.current += 1
    const prepared = preparedReflection
    setPrepareInFlight(false)
    setLogInFlight(true)
    realtimeCaptureRef.current?.abort?.()
    setRealtimeCaptureHandle(null)
    if (prepared && backend?.forgetPreparedReflection) {
      try {
        await backend.forgetPreparedReflection(prepared)
      } catch (err) {
        console.warn('[AskSheet] prepared reflection forget failed', err)
      }
    }
    setPreparedReflection(null)
    setReframe(null)
    setLogInFlight(false)
    setPendingLocalCaptureId(null)
    close()
  }

  function isLiveWorkflow(runId: number) {
    return mountedRef.current && openRef.current && workflowRunRef.current === runId
  }

  function logReview() {
    const nextText = reviewText.trim()
    if (!nextText && !recordedAudioBlob) return
    commitCapture(
      { text: nextText || 'Voice recording awaiting transcript...' },
      recordedAudioBlob ? { audioBlob: recordedAudioBlob, mimeType: recordedAudioMimeType } : {},
    )
    close()
  }

  function logReframe() {
    if (preparedReflection) {
      void logPreparedReframe()
      return
    }
    const nextText = reviewText.trim()
    if (!nextText) return
    commitCapture(
      { text: nextText, reframe, thread },
      recordedAudioBlob ? { audioBlob: recordedAudioBlob, mimeType: recordedAudioMimeType } : {},
    )
    close()
  }

  function talkMore() {
    setThread([{ role: 'kira', text: reframe?.headline || "I'm here. Say what's on your mind." }])
    setStage('chat')
  }

  function sendChat() {
    const next = chatInput.trim()
    if (!next) return
    setChatInput('')
    setThread((items) => {
      const studentTurns = items.filter((item) => item.role === 'you').length
      const reply = String(kiraReplyFor({ studentText: next, turnIndex: studentTurns }))
      return [
        ...items,
        { role: 'you' as const, text: next },
        { role: 'kira' as const, text: reply },
      ].slice(-50)
    })
  }

  function logFromChat() {
    const nextText = reviewText.trim()
    if (!nextText) return
    commitCapture(
      { text: nextText, reframe, thread },
      recordedAudioBlob ? { audioBlob: recordedAudioBlob, mimeType: recordedAudioMimeType } : {},
    )
    close()
  }

  async function onImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      setHint('Choose an image file.')
      return
    }
    try {
      setUploadedImageDataUrl(await readImageAsDataUrl(file))
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  const liveStudentText = liveDialogue
    .filter((message) => message.role === 'student' && message.status === 'final' && message.text)
    .map((message) => message.text)
    .join(' ')

  useEffect(() => {
    if (stage === 'recording' && liveStudentText) setReviewText(liveStudentText)
  }, [liveStudentText, stage])

  const visibleLiveDialogue = useMemo(
    () =>
      liveDialogue.length > 0
        ? liveDialogue
        : [
            {
              id: 'student-listening-placeholder',
              role: 'student',
              text: 'Listening...',
              status: 'streaming',
            } satisfies LiveMessage,
          ],
    [liveDialogue],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: visibleLiveDialogue is the scroll trigger, not read in the body.
  useLayoutEffect(() => {
    if (stage !== 'recording') return
    const node = liveDialogueRef.current
    if (!node) return
    const scrollToBottom = () => {
      node.scrollTop = node.scrollHeight
      liveDialogueEndRef.current?.scrollIntoView({ block: 'end' })
    }
    scrollToBottom()
    const frame = window.requestAnimationFrame(scrollToBottom)
    return () => window.cancelAnimationFrame(frame)
  }, [visibleLiveDialogue, stage])

  const [typeMode, setTypeMode] = useState(false)

  const companionName =
    (
      (
        engine as unknown as {
          state?: { profile?: { displayCompanionName?: () => string } }
        } | null
      )?.state?.profile?.displayCompanionName?.() || 'Kira'
    ).trim() || 'Kira'

  const stagePillLabel =
    stage === 'compose'
      ? companionName
      : stage === 'recording'
        ? 'Listening'
        : stage === 'review'
          ? 'What I heard'
          : stage === 'reframe'
            ? `${companionName}'s read`
            : 'Talking'

  return (
    <Drawer open={open} onOpenChange={(next) => (!next ? onBack() : null)}>
      <DrawerContent
        closeLabel={readOnly || dismissOnBack ? 'Close' : 'Back'}
        className="border-white/75 bg-[#fff7e8]/96 text-[#2b2620] shadow-[0_22px_60px_rgba(35,25,18,0.26)] backdrop-blur-md"
        popup
        hideOverlay
      >
        <DrawerTitle className="sr-only">Capture</DrawerTitle>
        <DrawerDescription className="sr-only">
          Capture a reflection with voice, feeling, or image.
        </DrawerDescription>
        <span
          aria-hidden
          className="absolute -top-3 left-6 rounded-full bg-[#ffd15f] px-3 py-1 text-xs font-extrabold text-[#402a10] shadow-[0_8px_18px_rgba(64,42,16,0.18)]"
        >
          {stagePillLabel}
        </span>
        <div className="flex w-full flex-col gap-4 px-1 pt-3 pb-1">
          {stage === 'compose' ? (
            <section className="flex flex-col gap-4">
              {letter ? (
                <button
                  type="button"
                  className="w-fit rounded-full bg-[#f3eee2] px-3 py-1 text-[11px] font-semibold text-[rgba(43,38,32,0.72)]"
                >
                  From {letter.from || 'your teacher'}
                  {letter.subject ? ` - ${letter.subject}` : ''}
                </button>
              ) : null}
              {prompt ? <p className="m-0 text-sm text-[rgba(43,38,32,0.62)]">{prompt}</p> : null}
              {uploadedImageDataUrl ? (
                <div className="overflow-hidden rounded-2xl border border-[rgba(43,38,32,0.08)]">
                  <img src={uploadedImageDataUrl} alt="" className="max-h-40 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setUploadedImageDataUrl(null)}
                    className="w-full bg-white/92 py-1.5 text-[11px] font-semibold text-[rgba(43,38,32,0.62)]"
                  >
                    Remove image
                  </button>
                </div>
              ) : null}
              {selectedMood ? (
                <button
                  type="button"
                  onClick={() => setSelectedMood(null)}
                  className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f3eee2] px-3 py-1 text-xs font-semibold text-[rgba(43,38,32,0.72)]"
                >
                  {EMOTION_BY_ID[selectedMood] ? (
                    <img
                      src={shapeDataUri(EMOTION_BY_ID[selectedMood] as EmotionEntry)}
                      alt=""
                      className="size-4"
                    />
                  ) : null}
                  {EMOTION_BY_ID[selectedMood]?.label ?? selectedMood}
                  <span aria-hidden className="text-[rgba(43,38,32,0.42)]">
                    ×
                  </span>
                </button>
              ) : null}
              <div className="flex min-h-44 flex-col justify-center">
                {!typeMode ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <button
                      type="button"
                      aria-label="Start voice recording"
                      onClick={() => void startRecording()}
                      className="grid size-20 cursor-pointer place-items-center rounded-full bg-(--color-onb-accent) text-white shadow-[0_10px_24px_-12px_rgba(214,116,58,0.55)] transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-(--color-onb-accent)/35"
                    >
                      <Mic aria-hidden className="size-8" />
                    </button>
                    <p className="text-xs font-medium text-[rgba(43,38,32,0.54)]">Tap to record</p>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col gap-3">
                    <textarea
                      ref={textareaRef}
                      rows={3}
                      value={text}
                      disabled={readOnly}
                      placeholder="Type your reflection…"
                      onChange={(event) => setText(event.target.value)}
                      className="min-h-24 w-full flex-1 resize-none border-0 bg-transparent px-1 py-2 text-base outline-none placeholder:text-[rgba(43,38,32,0.40)]"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        aria-label="Send"
                        disabled={!hasComposerInput}
                        onClick={saveTyped}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-(--color-onb-accent) px-3.5 text-xs font-semibold text-white transition-opacity hover:bg-(--color-onb-accent-deep) disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Send aria-hidden className="size-3.5" />
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={emojiOpen}
                    onClick={() => setEmojiOpen((next) => !next)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(43,38,32,0.10)] bg-white/72 px-3 py-1.5 text-xs font-semibold text-[rgba(43,38,32,0.72)] hover:bg-white',
                      emojiOpen && 'bg-white shadow-sm',
                    )}
                  >
                    <Smile aria-hidden className="size-3.5" />
                    Add feeling
                  </button>
                  <button
                    type="button"
                    aria-label="Upload image"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(43,38,32,0.10)] bg-white/72 px-3 py-1.5 text-xs font-semibold text-[rgba(43,38,32,0.72)] hover:bg-white"
                  >
                    <ImageIcon aria-hidden className="size-3.5" />
                    Photo
                  </button>
                </div>
                <div
                  role="tablist"
                  aria-label="Capture mode"
                  className="inline-flex items-center rounded-full bg-[rgba(43,38,32,0.06)] p-0.5"
                >
                  {(
                    [
                      { id: 'voice', label: 'Voice', icon: Mic },
                      { id: 'text', label: 'Text', icon: Type },
                    ] as const
                  ).map((option) => {
                    const isActive = (option.id === 'text') === typeMode
                    const Icon = option.icon
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={`Switch to ${option.label} mode`}
                        onClick={() => setTypeMode(option.id === 'text')}
                        className={cn(
                          'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-onb-accent)',
                          isActive
                            ? 'bg-white text-[rgba(43,38,32,0.92)] shadow-sm'
                            : 'text-[rgba(43,38,32,0.54)] hover:text-[rgba(43,38,32,0.78)]',
                        )}
                      >
                        <Icon aria-hidden className="size-3.5" />
                        {option.label}
                      </button>
                    )
                  })}
                </div>
                <input
                  ref={fileInputRef}
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={onImageChange}
                />
                {emojiOpen ? (
                  <div
                    role="dialog"
                    aria-label="Pick a feeling"
                    className="absolute bottom-[calc(100%+10px)] left-1/2 z-10 w-[min(360px,calc(100vw-4rem))] -translate-x-1/2 rounded-2xl border border-[rgba(43,38,32,0.10)] bg-white p-2 shadow-[0_18px_48px_rgba(43,38,32,0.18)]"
                  >
                    <div className="grid grid-cols-3 gap-1.5">
                      {EMOTIONS.map((emotion) => (
                        <button
                          key={emotion.id}
                          type="button"
                          aria-pressed={selectedMood === emotion.id}
                          onClick={() => {
                            setSelectedMood(emotion.id)
                            setEmojiOpen(false)
                          }}
                          className={cn(
                            'flex items-center gap-1.5 rounded-xl border border-transparent bg-[#fffdf6] p-1.5 text-[11px] font-semibold text-[rgba(43,38,32,0.78)] hover:border-[rgba(43,38,32,0.10)]',
                            selectedMood === emotion.id &&
                              'border-(--color-onb-accent) bg-white text-(--color-onb-accent)',
                          )}
                        >
                          <img src={shapeDataUri(emotion)} alt="" className="size-5" />
                          {emotion.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {hint ? <p className="m-0 text-xs text-red-700">{hint}</p> : null}
            </section>
          ) : null}

          {stage === 'recording' ? (
            <section className="flex min-h-0 flex-col gap-4">
              <div
                ref={liveDialogueRef}
                className="min-h-[260px] max-h-[min(430px,calc(100vh-16rem))] overflow-y-auto pr-1"
                role="log"
                aria-live="polite"
              >
                {visibleLiveDialogue.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      'mb-3 max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                      'transition-opacity duration-300 ease-out',
                      message.role === 'kira'
                        ? 'mr-auto bg-[#edf7f5] text-[#1f5a4f]'
                        : 'ml-auto bg-white text-[rgba(43,38,32,0.86)]',
                      message.status === 'streaming' && 'opacity-80',
                    )}
                  >
                    <span className="block text-[11px] font-bold opacity-60">
                      {message.role === 'kira' ? companionName : 'You'}
                    </span>
                    {message.status === 'streaming' && message.role !== 'kira' ? (
                      <TypingIndicator label={message.text || 'Listening...'} />
                    ) : (
                      <p className="m-0">{message.text}</p>
                    )}
                  </article>
                ))}
                <div ref={liveDialogueEndRef} aria-hidden className="h-px" />
              </div>
              {liveHint ? (
                <p className="m-0 text-xs text-[rgba(43,38,32,0.54)]">{liveHint}</p>
              ) : null}
              <button
                type="button"
                onClick={() => void stopRecording()}
                className="min-h-12 rounded-full bg-[rgba(43,38,32,0.92)] px-5 text-sm font-semibold text-white transition-transform duration-150 hover:-translate-y-0.5"
              >
                Done
              </button>
            </section>
          ) : null}

          {stage === 'review' ? (
            <ReviewStage
              readOnly={readOnly}
              reviewText={reviewText}
              imageDataUrl={uploadedImageDataUrl}
              reframe={reframe}
              thread={thread}
              onDiscard={() => close()}
              onLog={logReview}
              onReframe={() => void prepareMirrorDraft()}
            />
          ) : null}

          {stage === 'reframe' ? (
            <ReframeStage
              reframe={reframe}
              mode={reframeActionMode}
              canLog={Boolean(reviewText.trim())}
              onEdit={() => {
                setText(reviewText)
                setReframe((current) => (current ? { ...current, edited: true } : current))
                setStage('compose')
              }}
              onTalkMore={talkMore}
              onForget={() => void forgetDraft()}
              onLog={logReframe}
              busy={prepareInFlight || logInFlight}
            />
          ) : null}

          {stage === 'chat' ? (
            <section className="flex min-h-0 flex-col gap-3">
              <div
                className="min-h-0 max-h-[360px] overflow-y-auto rounded-2xl bg-white/72 p-4"
                role="log"
              >
                {thread.map((message) => (
                  <article
                    key={threadKey(message)}
                    className={cn(
                      'mb-3 max-w-[82%] rounded-2xl px-3 py-2 text-sm',
                      message.role === 'kira'
                        ? 'mr-auto bg-[#edf7f5] text-[#1f5a4f]'
                        : 'ml-auto bg-white text-[rgba(43,38,32,0.86)]',
                    )}
                  >
                    <span className="block text-[11px] font-bold opacity-60">
                      {message.role === 'kira' ? companionName : 'You'}
                    </span>
                    <p className="m-0 whitespace-pre-wrap">{message.text}</p>
                  </article>
                ))}
              </div>
              <div className="flex gap-2 rounded-full bg-white/80 p-2">
                <textarea
                  rows={1}
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      sendChat()
                    }
                  }}
                  placeholder="Say more..."
                  className="min-h-10 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  aria-label="Send chat message"
                  onClick={sendChat}
                  className="grid size-10 place-items-center rounded-full bg-(--color-onb-accent) text-white"
                >
                  <Send aria-hidden className="size-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={logFromChat}
                className="min-h-12 rounded-full bg-[rgba(43,38,32,0.92)] px-5 text-sm font-semibold text-white"
              >
                Log
              </button>
            </section>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function ReviewStage({
  readOnly,
  reviewText,
  imageDataUrl,
  reframe,
  thread,
  onDiscard,
  onLog,
  onReframe,
}: {
  readOnly: boolean
  reviewText: string
  imageDataUrl: string | null
  reframe: Reframe | null
  thread: ThreadMessage[]
  onDiscard: () => void
  onLog: () => void
  onReframe: () => void
}) {
  return (
    <section className="flex min-h-0 flex-col gap-4">
      <h2 className="m-0 text-xl font-semibold">Here's what you said.</h2>
      <div className="rounded-3xl bg-white/72 p-4 text-base leading-7 text-[rgba(43,38,32,0.82)]">
        {reviewText || 'Audio recorded. Transcript will appear after Mirror listens.'}
      </div>
      {imageDataUrl ? (
        <img src={imageDataUrl} alt="" className="max-h-56 rounded-3xl object-cover" />
      ) : null}
      {readOnly && reframe ? <ReframeReadout reframe={reframe} /> : null}
      {readOnly && thread.length > 0 ? (
        <div className="rounded-3xl bg-white/70 p-4">
          {thread.map((message) => (
            <p key={threadKey(message)} className="m-0 mb-2 text-sm">
              <strong>{message.role === 'kira' ? 'Mirror' : 'you'}:</strong> {message.text}
            </p>
          ))}
        </div>
      ) : null}
      {!readOnly ? (
        <>
          {reviewText ? (
            <button
              type="button"
              onClick={onReframe}
              className="min-h-12 rounded-full bg-[#f3eee2] px-5 text-sm font-semibold text-[rgba(43,38,32,0.82)]"
            >
              What I heard
            </button>
          ) : null}
          <div className="mt-auto flex justify-end gap-3">
            <button
              type="button"
              onClick={onDiscard}
              className="min-h-11 rounded-full px-5 text-sm font-semibold text-[rgba(43,38,32,0.54)] hover:bg-black/5"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onLog}
              className="min-h-11 rounded-full bg-(--color-onb-accent) px-5 text-sm font-semibold text-white"
            >
              Log
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}

function ReframeStage({
  reframe,
  mode,
  canLog,
  onEdit,
  onTalkMore,
  onForget,
  onLog,
  busy,
}: {
  reframe: Reframe | null
  mode: 'offline' | 'preparing' | 'ready' | 'failed' | 'logging'
  canLog: boolean
  onEdit: () => void
  onTalkMore: () => void
  onForget: () => void
  onLog: () => void
  busy: boolean
}) {
  return (
    <section className="flex h-full flex-col gap-5">
      <ReframeReadout reframe={reframe} busy={mode === 'preparing'} />
      <div className="mt-auto flex flex-wrap justify-end gap-3">
        {mode === 'offline' || mode === 'failed' ? (
          <>
            <button
              type="button"
              onClick={onEdit}
              className="min-h-11 rounded-full px-5 text-sm font-semibold text-[rgba(43,38,32,0.58)] hover:bg-black/5"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onTalkMore}
              className="min-h-11 rounded-full bg-[#f3eee2] px-5 text-sm font-semibold text-[rgba(43,38,32,0.82)]"
            >
              {mode === 'failed' ? 'Continue session' : 'Talk more'}
            </button>
          </>
        ) : null}
        {mode !== 'offline' ? (
          <button
            type="button"
            disabled={busy}
            onClick={onForget}
            className="min-h-11 rounded-full px-5 text-sm font-semibold text-[rgba(43,38,32,0.58)] hover:bg-black/5 disabled:opacity-45"
          >
            Forget
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || (!canLog && mode === 'failed') || mode === 'preparing'}
          onClick={onLog}
          className="min-h-11 rounded-full bg-(--color-onb-accent) px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          Log
        </button>
      </div>
    </section>
  )
}

function TypingIndicator({ label }: { label: string }) {
  return (
    <div className="mt-1 inline-flex min-h-6 items-center gap-1.5" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      <span
        aria-hidden="true"
        className="size-2 animate-pulse rounded-full bg-[rgba(43,38,32,0.42)] [animation-delay:-0.32s]"
      />
      <span
        aria-hidden="true"
        className="size-2 animate-pulse rounded-full bg-[rgba(43,38,32,0.42)] [animation-delay:-0.16s]"
      />
      <span
        aria-hidden="true"
        className="size-2 animate-pulse rounded-full bg-[rgba(43,38,32,0.42)]"
      />
    </div>
  )
}

function ReframeReadout({ reframe, busy }: { reframe: Reframe | null; busy?: boolean }) {
  const moods = reframe?.moods?.length ? reframe.moods.slice(0, 2) : ['ennui']
  const themes = reframe?.themes ?? []
  return (
    <div className="rounded-3xl bg-white/74 p-5 shadow-sm">
      <div className="flex gap-2" aria-hidden="true">
        {moods.map((id) => {
          const emotion = EMOTION_BY_ID[id] as EmotionEntry | undefined
          if (!emotion) return null
          return <img key={id} src={shapeDataUri(emotion)} alt="" className="size-12" />
        })}
      </div>
      {themes.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {themes.slice(0, 3).map((theme, index) => {
            const pill = THEME_PILL[theme] || {
              label: theme,
              need: reframe?.needs?.[index] || '',
              mood: 'ennui',
            }
            return (
              <span
                key={`theme-${theme}`}
                className="rounded-full bg-[#f3eee2] px-3 py-1 text-xs font-semibold text-[rgba(43,38,32,0.72)]"
              >
                {pill.label}
                {pill.need ? ` · ${pill.need}` : ''}
              </span>
            )
          })}
        </div>
      ) : null}
      {reframe?.highlightPhrase ? (
        <blockquote className="my-5 border-l-4 border-(--color-onb-accent) pl-4 text-lg italic leading-7 text-[rgba(43,38,32,0.82)]">
          {reframe.highlightPhrase}
        </blockquote>
      ) : null}
      <p className="m-0 text-xs font-bold text-[rgba(43,38,32,0.48)]">Reading</p>
      {busy ? (
        <div className="mt-3 flex items-center gap-2 text-base leading-7 text-[rgba(43,38,32,0.62)]">
          <span className="inline-flex gap-1" aria-hidden="true">
            <span className="size-1.5 animate-pulse rounded-full bg-(--color-onb-accent) [animation-delay:-0.32s]" />
            <span className="size-1.5 animate-pulse rounded-full bg-(--color-onb-accent) [animation-delay:-0.16s]" />
            <span className="size-1.5 animate-pulse rounded-full bg-(--color-onb-accent)" />
          </span>
          <span>Reading this back…</span>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-[rgba(43,38,32,0.82)]">
          {reframe?.headline || ''}
        </p>
      )}
    </div>
  )
}

function threadKey(message: ThreadMessage) {
  return `${message.role}-${message.text.slice(0, 72)}-${message.text.length}`
}
