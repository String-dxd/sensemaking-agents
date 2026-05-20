import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import {
  Bot,
  CheckCircle2,
  Circle,
  Database,
  GitBranch,
  Loader2,
  type LucideIcon,
  Mic,
  Play,
  RefreshCw,
  Route as RouteIcon,
  Square,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { RunStepEvent } from '~/agents/run-events'
import { Button } from '~/components/ui/button'
import type { CartographerOutputRow, MirrorReviewStatus, VipsProposedDiffRow } from '~/db/queries'
import {
  canCreateRealtimeMirrorCapture,
  createRealtimeMirrorCapture,
  type StudentSpaceRealtimeConversationUpdate,
  type StudentSpaceRealtimeMirrorCapture,
  type StudentSpaceRealtimePreparedReflection,
} from '~/lib/student-space/realtime-mirror-client'
import { cn } from '~/lib/utils'
import { loadPipelineTrace } from '~/server/load-pipeline-trace.functions'
import type { PipelineMirrorRow, PipelineTraceResult } from '~/server/load-pipeline-trace.types'
import { persistMirror } from '~/server/persist-mirror.functions'
import { runCartographer } from '~/server/run-cartographer.functions'
import { runConnector } from '~/server/run-connector.functions'
import { runMirror } from '~/server/run-mirror.functions'

export const Route = createFileRoute('/dev/pipeline')({
  // Dev-only surface. In production the route 404s before the loader runs so
  // verifier audit data is not reachable from a deployed app.
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  loader: () => loadPipelineTrace({ data: {} }),
  component: PipelinePage,
  errorComponent: PipelineErrorFallback,
})

type FilterState = 'all' | MirrorReviewStatus

function PipelineErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded border border-warning/30 bg-background/90 p-4 text-sm font-mono">
      <p className="font-semibold">/dev/pipeline failed to load.</p>
      <p className="mt-1 text-muted-foreground">{error.message}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded border border-border bg-background px-2 py-1 hover:bg-muted"
        >
          Retry
        </button>
        <span className="self-center text-[11px] text-muted-foreground">
          ⌘K to switch to UI mode
        </span>
      </div>
    </div>
  )
}

// Exported for direct test rendering — the route entry point still wires
// this via `component: PipelinePage` so production behavior is unchanged.
export function PipelinePageView({ data }: { data: PipelineTraceResult }) {
  return <PipelinePageInner data={data} />
}

function PipelinePage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  return <PipelinePageInner data={data} onRefresh={() => void router.invalidate()} />
}

type PipelineActionKey =
  | 'realtime-transcript'
  | 'initial-chat'
  | 'connector'
  | 'sensemaking'
  | 'full-flow'
type PipelineActionState = {
  key: PipelineActionKey
  status: 'idle' | 'running' | 'ok' | 'error'
  message: string
}

type PipelineActionLogEntry = {
  id: string
  at: string
  tone: 'info' | 'success' | 'error'
  text: string
}

type PipelineActionTools = {
  log: (text: string, tone?: PipelineActionLogEntry['tone']) => void
  setWaitingLabel: (label: string) => void
}

type RealtimeTranscriptStage = 'idle' | 'connecting' | 'recording' | 'stopping'

type PipelineStepStatus = 'passed' | 'ready' | 'waiting' | 'running'

type PipelineHealthSummary = {
  confirmedMirrors: number
  pendingMirrors: number
  linkedMirrors: number
  unlinkedConfirmedMirrors: number
  committedClaims: number
  updatedPages: number
  cartographerPathways: number
}

const DEFAULT_DEV_TRANSCRIPT =
  'I helped my friend debug our robotics project after class and noticed I liked breaking the problem into small tests.'

function PipelinePageInner({
  data,
  onRefresh,
}: {
  data: PipelineTraceResult
  onRefresh?: () => void | Promise<void>
}) {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<FilterState>('all')
  const [transcript, setTranscript] = useState(DEFAULT_DEV_TRANSCRIPT)
  const [realtimeStage, setRealtimeStage] = useState<RealtimeTranscriptStage>('idle')
  const [realtimeConversation, setRealtimeConversation] = useState<
    StudentSpaceRealtimeConversationUpdate[]
  >([])
  const [realtimePrepared, setRealtimePrepared] =
    useState<StudentSpaceRealtimePreparedReflection | null>(null)
  const realtimeCaptureRef = useRef<StudentSpaceRealtimeMirrorCapture | null>(null)
  const [action, setAction] = useState<PipelineActionState>({
    key: 'initial-chat',
    status: 'idle',
    message: 'Ready.',
  })
  const [actionLog, setActionLog] = useState<PipelineActionLogEntry[]>([
    makeActionLogEntry('Ready.', 'info'),
  ])

  const filteredMirrors = useMemo(() => {
    if (filter === 'all') return data.mirrors
    return data.mirrors.filter((m) => m.review_status === filter)
  }, [data.mirrors, filter])
  const health = useMemo(() => summarizePipelineHealth(data), [data])

  useEffect(
    () => () => {
      realtimeCaptureRef.current?.abort()
      realtimeCaptureRef.current = null
    },
    [],
  )

  function toggleRow(id: number) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function appendActionLog(text: string, tone: PipelineActionLogEntry['tone'] = 'info') {
    setActionLog((prev) => [...prev, makeActionLogEntry(text, tone)])
  }

  function upsertRealtimeConversation(update: StudentSpaceRealtimeConversationUpdate) {
    const text = update.text.trim()
    if (!text) return
    setRealtimeConversation((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === update.id)
      if (existingIndex === -1) return [...prev, { ...update, text }]
      const next = [...prev]
      next[existingIndex] = { ...update, text }
      return next
    })
    if (update.status === 'final') {
      appendActionLog(
        `Realtime ${update.role === 'kira' ? 'Kira' : 'student'}: ${truncateForLog(text)}`,
      )
    }
  }

  async function startRealtimeTranscriptTest() {
    if (action.status === 'running' || realtimeStage !== 'idle') return
    if (!canCreateRealtimeMirrorCapture()) {
      const message = 'Realtime GPT transcript test is not available in this browser.'
      setAction({ key: 'realtime-transcript', status: 'error', message })
      setActionLog([makeActionLogEntry(message, 'error')])
      return
    }

    setRealtimeStage('connecting')
    setRealtimeConversation([])
    setRealtimePrepared(null)
    setAction({
      key: 'realtime-transcript',
      status: 'running',
      message: 'Opening Realtime GPT transcript test...',
    })
    setActionLog([
      makeActionLogEntry('Realtime: requesting microphone and GPT Realtime session.', 'info'),
    ])

    try {
      const capture = await createRealtimeMirrorCapture({
        localCaptureId: `dev-pipeline-realtime-${Date.now()}`,
        contextType: 'school',
        onConversationUpdate: upsertRealtimeConversation,
      })
      realtimeCaptureRef.current = capture
      setRealtimeStage('recording')
      appendActionLog('Realtime: connected. Speak into the mic, then stop session.', 'success')
      setAction({
        key: 'realtime-transcript',
        status: 'running',
        message: 'Realtime session live. Speak, then stop to finalize transcript.',
      })
    } catch (err) {
      realtimeCaptureRef.current = null
      setRealtimeStage('idle')
      const message = err instanceof Error ? err.message : String(err)
      appendActionLog(message, 'error')
      setAction({ key: 'realtime-transcript', status: 'error', message })
    }
  }

  async function stopRealtimeTranscriptTest() {
    const capture = realtimeCaptureRef.current
    if (!capture || realtimeStage !== 'recording') return

    setRealtimeStage('stopping')
    setAction({
      key: 'realtime-transcript',
      status: 'running',
      message: 'Stopping Realtime GPT transcript test...',
    })
    appendActionLog('Realtime: stopping session and requesting final Mirror JSON.')

    try {
      const prepared = await capture.stop()
      realtimeCaptureRef.current = null
      setRealtimeStage('idle')
      setRealtimePrepared(prepared)
      setTranscript(prepared.transcript)
      const message = `Realtime transcript captured (${wordCount(prepared.transcript)} words).`
      appendActionLog('Realtime: transcript copied into the initial chat field.', 'success')
      setAction({ key: 'realtime-transcript', status: 'ok', message })
    } catch (err) {
      realtimeCaptureRef.current = null
      setRealtimeStage('idle')
      const message = err instanceof Error ? err.message : String(err)
      appendActionLog(message, 'error')
      setAction({ key: 'realtime-transcript', status: 'error', message })
    }
  }

  async function runPipelineAction(
    key: PipelineActionKey,
    initialWaitingLabel: string,
    work: (tools: PipelineActionTools) => Promise<string>,
  ) {
    let waitingLabel = initialWaitingLabel
    const startedAt = Date.now()
    const log = (text: string, tone: PipelineActionLogEntry['tone'] = 'info') => {
      setActionLog((prev) => [...prev, makeActionLogEntry(text, tone)])
    }
    const setWaitingLabel = (label: string) => {
      waitingLabel = label
    }
    setAction({ key, status: 'running', message: `Running ${initialWaitingLabel}...` })
    setActionLog([makeActionLogEntry(`Started ${initialWaitingLabel}.`, 'info')])
    const heartbeat = window.setInterval(() => {
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
      log(`Still waiting on ${waitingLabel} (${elapsedSeconds}s elapsed).`)
    }, 5000)
    try {
      const message = await work({ log, setWaitingLabel })
      window.clearInterval(heartbeat)
      log(message, 'success')
      setAction({ key, status: 'ok', message })
      await onRefresh?.()
    } catch (err) {
      window.clearInterval(heartbeat)
      const message = err instanceof Error ? err.message : String(err)
      log(message, 'error')
      setAction({
        key,
        status: 'error',
        message,
      })
    }
  }

  async function runInitialChat() {
    const cleanTranscript = transcript.trim()
    if (!cleanTranscript) {
      setAction({
        key: 'initial-chat',
        status: 'error',
        message: 'Add a transcript before running the initial chat.',
      })
      return
    }
    await runPipelineAction('initial-chat', 'Mirror', async ({ log, setWaitingLabel }) => {
      log('Mirror: sending transcript to OpenAI Realtime.')
      const mirror = await runMirror({ data: { transcript: cleanTranscript } })
      log('Mirror: output received and schema-checked.')

      setWaitingLabel('Mirror persistence')
      log('Persistence: saving Mirror entry as confirmed.')
      const result = await persistMirror({
        data: {
          entry: {
            transcript: cleanTranscript,
            validation: mirror.output.validation,
            inferred_meaning: mirror.output.inferred_meaning,
            story_reframe: mirror.output.story_reframe,
          },
          context_type: 'school',
          review_status: 'confirmed',
          raw_output: {
            ...mirror.output,
            eval_review: mirror.eval_review,
          },
          trace: {
            source: 'dev-pipeline',
            initial_chat: true,
          },
        },
      })
      return `Mirror #${result.mirror_entry.id} recorded as ${result.mirror_entry.review_status}.`
    })
  }

  async function runConnectorAction() {
    await runPipelineAction('connector', 'Connector', async ({ log }) => {
      log('Connector: scanning confirmed reflections that are not linked yet.')
      const result = await runConnector({ data: { limit: 5 } })
      for (const entry of result.entries) {
        log(
          `Connector: mirror #${entry.mirror_entry_id} -> ${entry.status}${
            entry.staged_diff_id ? `, diff #${entry.staged_diff_id}` : ''
          }.`,
        )
      }
      return connectorStatusCopy(
        result.status,
        result.processed,
        result.succeeded,
        result.failed,
        result.remaining,
      )
    })
  }

  async function runSensemakingAction() {
    await runPipelineAction('sensemaking', 'Cartographer', async ({ log }) => {
      log('Cartographer: reading VIPS pages and timeline evidence.')
      const result = await runCartographer({ data: {} })
      for (const event of result.events) {
        log(`Cartographer event +${event.timestampMs}ms: ${summarizeRunEvent(event)}.`)
      }
      if (!result.ok) throw new Error(`Cartographer ${result.status}: ${result.error}`)
      return `Cartographer #${result.cartographer_output_id} wrote ${result.trajectory.pathways.length} pathways.`
    })
  }

  async function runFullFlowAction() {
    const cleanTranscript = transcript.trim()
    if (!cleanTranscript) {
      setAction({
        key: 'full-flow',
        status: 'error',
        message: 'Add a transcript before running the full backend flow.',
      })
      return
    }

    await runPipelineAction('full-flow', 'full backend flow', async ({ log, setWaitingLabel }) => {
      log('Mirror: generating reflection output from the transcript.')
      const mirror = await runMirror({ data: { transcript: cleanTranscript } })
      log('Mirror: output received and schema-checked.')

      setWaitingLabel('Mirror persistence')
      log('Persistence: saving Mirror entry as confirmed.')
      const persisted = await persistMirror({
        data: {
          entry: {
            transcript: cleanTranscript,
            validation: mirror.output.validation,
            inferred_meaning: mirror.output.inferred_meaning,
            story_reframe: mirror.output.story_reframe,
          },
          context_type: 'school',
          review_status: 'confirmed',
          raw_output: {
            ...mirror.output,
            eval_review: mirror.eval_review,
          },
          trace: {
            source: 'dev-pipeline',
            full_flow: true,
          },
        },
      })
      log(`Persistence: Mirror #${persisted.mirror_entry.id} recorded as confirmed.`, 'success')

      setWaitingLabel('Connector')
      log('Connector: linking confirmed reflections to VIPS evidence.')
      const connector = await runConnector({ data: { limit: 5 } })
      for (const entry of connector.entries) {
        log(
          `Connector: mirror #${entry.mirror_entry_id} -> ${entry.status}${
            entry.staged_diff_id ? `, diff #${entry.staged_diff_id}` : ''
          }.`,
        )
      }

      const connectorCopy = connectorStatusCopy(
        connector.status,
        connector.processed,
        connector.succeeded,
        connector.failed,
        connector.remaining,
      )
      if (connector.failed > 0 && connector.succeeded === 0) throw new Error(connectorCopy)

      setWaitingLabel('Cartographer')
      log('Cartographer: synthesizing the latest Trajectory page.')
      const cartographer = await runCartographer({ data: {} })
      for (const event of cartographer.events) {
        log(`Cartographer event +${event.timestampMs}ms: ${summarizeRunEvent(event)}.`)
      }
      if (!cartographer.ok) {
        throw new Error(`Cartographer ${cartographer.status}: ${cartographer.error}`)
      }

      const verdict = connector.status === 'ok' ? 'passed' : 'completed'
      return `Full flow ${verdict}: Mirror #${persisted.mirror_entry.id}; ${connectorCopy} Cartographer #${cartographer.cartographer_output_id} wrote ${cartographer.trajectory.pathways.length} pathways.`
    })
  }

  const actionRunning = action.status === 'running'

  return (
    <div className="font-sans text-sm leading-relaxed text-foreground">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded border border-border bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Dev only
            </span>
            <span className="rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              Cmd+K /dev/pipeline
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">Agent pipeline test bench</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Active student{' '}
            <span className="font-medium text-foreground">{data.activeStudentId}</span> · mirrors{' '}
            {data.totals.mirrors} · diffs {data.totals.diffs} · committed claims{' '}
            {data.totals.committed_timeline}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRefresh?.()}
            className="gap-2"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh trace
          </Button>
          <FilterPills filter={filter} onChange={setFilter} />
        </div>
      </header>

      <PipelineHealthStrip health={health} action={action} />

      <section className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded border border-border bg-muted/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">End-to-end run</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Run the backend path in one pass, or trigger each agent stage independently.
              </p>
            </div>
            <StatusBadge value={action.status} />
          </div>

          <label className="mt-4 block" htmlFor="pipeline-transcript">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Initial chat transcript
            </span>
            <textarea
              id="pipeline-transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              className="min-h-28 w-full resize-y rounded border border-border bg-background px-3 py-2 font-mono text-xs leading-relaxed outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void runFullFlowAction()}
              disabled={actionRunning}
              size="sm"
              className="gap-2"
            >
              <Play className="size-3.5" aria-hidden="true" />
              Run full backend flow
            </Button>
            <Button
              type="button"
              onClick={() => void runInitialChat()}
              disabled={actionRunning}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Bot className="size-3.5" aria-hidden="true" />
              Run initial chat
            </Button>
            <Button
              type="button"
              onClick={() => void runConnectorAction()}
              disabled={actionRunning}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <GitBranch className="size-3.5" aria-hidden="true" />
              Run Connector
            </Button>
            <Button
              type="button"
              onClick={() => void runSensemakingAction()}
              disabled={actionRunning}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RouteIcon className="size-3.5" aria-hidden="true" />
              Run sense-making
            </Button>
          </div>

          <p
            className={cn(
              'mt-3 text-sm',
              action.status === 'error' ? 'text-warning' : 'text-muted-foreground',
            )}
            role={action.status === 'error' ? 'alert' : 'status'}
          >
            {action.message}
          </p>
          <div
            className="mt-3 max-h-48 overflow-y-auto rounded border border-border bg-background px-3 py-2 font-mono text-xs"
            aria-live="polite"
            data-testid="pipeline-action-log"
          >
            <ol className="space-y-1">
              {actionLog.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    'grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2',
                    entry.tone === 'success'
                      ? 'text-emerald-700'
                      : entry.tone === 'error'
                        ? 'text-warning'
                        : 'text-muted-foreground',
                  )}
                >
                  <time dateTime={entry.at}>{formatClock(entry.at)}</time>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="rounded border border-border bg-background p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Realtime transcript path</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Capture live Kira audio, then copy the final transcript into the backend run.
              </p>
            </div>
            <StatusBadge value={realtimeStage} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void startRealtimeTranscriptTest()}
              disabled={actionRunning || realtimeStage !== 'idle'}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Mic className="size-3.5" aria-hidden="true" />
              Start Realtime transcript
            </Button>
            <Button
              type="button"
              onClick={() => void stopRealtimeTranscriptTest()}
              disabled={realtimeStage !== 'recording'}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <Square className="size-3.5" aria-hidden="true" />
              Stop Realtime transcript
            </Button>
          </div>
          <div
            className="mt-3 grid min-h-24 gap-2 rounded border border-border bg-muted/20 px-3 py-2 font-mono text-xs"
            role="log"
            aria-live="polite"
            data-testid="realtime-transcript-log"
          >
            {realtimeConversation.length === 0 ? (
              <p className="self-center text-muted-foreground">No live Realtime transcript yet.</p>
            ) : (
              realtimeConversation.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    'rounded border border-border bg-background px-2 py-1',
                    message.status === 'streaming' ? 'opacity-75' : '',
                  )}
                >
                  <span className="font-sans text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {message.role === 'kira' ? 'Kira' : 'You'}
                    {message.status === 'streaming' ? ' · streaming' : ''}
                  </span>
                  <p>{message.text}</p>
                </article>
              ))
            )}
          </div>
          {realtimePrepared ? (
            <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
              <p>
                <span className="font-semibold text-foreground">Validation:</span>{' '}
                {realtimePrepared.validation}
              </p>
              <p>
                <span className="font-semibold text-foreground">Meaning:</span>{' '}
                {realtimePrepared.inferredMeaning}
              </p>
              <p>
                <span className="font-semibold text-foreground">Reframe:</span>{' '}
                {realtimePrepared.storyReframe}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mb-4 rounded border border-border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Trace evidence</h2>
            <p className="mt-1 max-w-3xl text-muted-foreground">
              The sections below show what the backend persisted after each agent stage.
            </p>
          </div>
        </div>
      </section>

      <ConnectorGraph mirrors={data.mirrors} />

      <section className="mb-4">
        <h2 className="mb-2 font-sans text-sm font-semibold">
          VIPS pages (current compiled truth)
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.pages.map((p) => (
            <article
              key={p.dimension}
              className="rounded border border-border bg-muted/40 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-sans text-xs font-semibold uppercase tracking-wide">
                  {p.dimension}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {p.updated_at ? formatTime(p.updated_at) : '—'}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-foreground">
                {p.compiled_truth || <span className="text-muted-foreground">(empty)</span>}
              </p>
              {p.open_question ? (
                <p className="mt-1 text-muted-foreground">Q: {p.open_question}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <CartographerCard cartographer={data.cartographer} />

      <section>
        <h2 className="mb-2 font-sans text-sm font-semibold">Mirror entries</h2>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="bg-muted/40 text-left">
              <tr>
                <Th>id</Th>
                <Th>created_at</Th>
                <Th>context</Th>
                <Th>review</Th>
                <Th className="w-[34%]">transcript</Th>
                <Th>diffs</Th>
                <Th>committed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filteredMirrors.length === 0 ? (
                <tr>
                  <Td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No mirror entries match the filter.
                  </Td>
                </tr>
              ) : (
                filteredMirrors.map((m) => (
                  <MirrorRow
                    key={m.id}
                    mirror={m}
                    open={openIds.has(m.id)}
                    onToggle={() => toggleRow(m.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-muted-foreground">
        Hit <kbd className="rounded border border-border px-1">⌘K</kbd> to switch to UI mode.
      </p>
    </div>
  )
}

function PipelineHealthStrip({
  health,
  action,
}: {
  health: PipelineHealthSummary
  action: PipelineActionState
}) {
  const fullFlowRunning = action.status === 'running' && action.key === 'full-flow'
  const mirrorStatus: PipelineStepStatus =
    action.status === 'running' && (action.key === 'initial-chat' || fullFlowRunning)
      ? 'running'
      : health.confirmedMirrors > 0
        ? 'passed'
        : 'ready'
  const connectorStatus: PipelineStepStatus =
    action.status === 'running' && (action.key === 'connector' || fullFlowRunning)
      ? 'running'
      : health.linkedMirrors > 0
        ? 'passed'
        : health.confirmedMirrors > 0
          ? 'ready'
          : 'waiting'
  const vipsStatus: PipelineStepStatus =
    action.status === 'running' && (action.key === 'connector' || fullFlowRunning)
      ? 'running'
      : health.committedClaims > 0
        ? 'passed'
        : health.linkedMirrors > 0
          ? 'ready'
          : 'waiting'
  const cartographerStatus: PipelineStepStatus =
    action.status === 'running' && (action.key === 'sensemaking' || fullFlowRunning)
      ? 'running'
      : health.cartographerPathways > 0
        ? 'passed'
        : health.committedClaims > 0
          ? 'ready'
          : 'waiting'

  return (
    <section className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <PipelineHealthCard
        icon={Bot}
        title="Mirror"
        status={mirrorStatus}
        value={`${health.confirmedMirrors} confirmed`}
        detail={`${health.pendingMirrors} pending review`}
      />
      <PipelineHealthCard
        icon={GitBranch}
        title="Connector"
        status={connectorStatus}
        value={`${health.linkedMirrors} linked mirrors`}
        detail={`${health.unlinkedConfirmedMirrors} confirmed unlinked`}
      />
      <PipelineHealthCard
        icon={Database}
        title="VIPS evidence"
        status={vipsStatus}
        value={`${health.committedClaims} committed claims`}
        detail={`${health.updatedPages} compiled pages updated`}
      />
      <PipelineHealthCard
        icon={RouteIcon}
        title="Cartographer"
        status={cartographerStatus}
        value={`${health.cartographerPathways} pathways`}
        detail="latest trajectory output"
      />
    </section>
  )
}

function PipelineHealthCard({
  icon: Icon,
  title,
  status,
  value,
  detail,
}: {
  icon: LucideIcon
  title: string
  status: PipelineStepStatus
  value: string
  detail: string
}) {
  return (
    <article className="rounded border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="truncate font-mono text-xs text-muted-foreground">{value}</p>
          </div>
        </div>
        <StepStatusBadge status={status} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </article>
  )
}

function StepStatusBadge({ status }: { status: PipelineStepStatus }) {
  const Icon = status === 'passed' ? CheckCircle2 : status === 'running' ? Loader2 : Circle
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        status === 'passed'
          ? 'bg-emerald-500/15 text-emerald-700'
          : status === 'running'
            ? 'bg-blue-500/15 text-blue-700'
            : status === 'ready'
              ? 'bg-accent/15 text-accent'
              : 'bg-zinc-500/15 text-zinc-600',
      )}
    >
      <Icon className={cn('size-3', status === 'running' ? 'animate-spin' : '')} aria-hidden />
      {status}
    </span>
  )
}

function summarizePipelineHealth(data: PipelineTraceResult): PipelineHealthSummary {
  const confirmed = data.mirrors.filter((mirror) => mirror.review_status === 'confirmed')
  const pending = data.mirrors.filter((mirror) => mirror.review_status === 'pending')
  const linked = data.mirrors.filter((mirror) => mirror.committed_timeline.length > 0)
  const unlinkedConfirmed = confirmed.filter((mirror) => mirror.committed_timeline.length === 0)
  return {
    confirmedMirrors: confirmed.length,
    pendingMirrors: pending.length,
    linkedMirrors: linked.length,
    unlinkedConfirmedMirrors: unlinkedConfirmed.length,
    committedClaims: data.totals.committed_timeline,
    updatedPages: data.pages.filter((page) => page.compiled_truth.trim().length > 0).length,
    cartographerPathways: data.cartographer?.pathways.length ?? 0,
  }
}

type ConnectorGraphMirrorNode = {
  id: string
  mirror: PipelineMirrorRow
  x: number
  y: number
  linked: boolean
}

type ConnectorGraphClaimNode = {
  id: string
  key: string
  dimension: string
  claimId: string
  label: string
  x: number
  y: number
  count: number
  mirrorIds: number[]
}

type ConnectorGraphEdge = {
  id: string
  source: string
  target: string
  sourceMirrorId: number
  targetClaimKey: string
  forgotten: boolean
}

type ConnectorGraphModel = {
  mirrors: ConnectorGraphMirrorNode[]
  claims: ConnectorGraphClaimNode[]
  edges: ConnectorGraphEdge[]
  linkedMirrorCount: number
}

const GRAPH_DIMENSIONS = ['values', 'interests', 'personality', 'skills'] as const
const GRAPH_DIMENSION_COLORS: Record<string, string> = {
  values: '#2f6b45',
  interests: '#795f1b',
  personality: '#6b5796',
  skills: '#1e6384',
}

function ConnectorGraph({ mirrors }: { mirrors: PipelineMirrorRow[] }) {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  const graph = useMemo(() => buildConnectorGraph(mirrors), [mirrors])
  const activeEdges = useMemo(() => {
    if (!activeNodeId) return new Set<string>()
    return new Set(
      graph.edges
        .filter((edge) => edge.source === activeNodeId || edge.target === activeNodeId)
        .map((edge) => edge.id),
    )
  }, [activeNodeId, graph.edges])
  const hasLinks = graph.edges.length > 0

  return (
    <section className="mb-4 rounded border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-sm font-semibold">Connector graph</h2>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Mirror dots link to the VIPS claims created from Connector patterns.
          </p>
        </div>
        <span className="rounded border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          {graph.linkedMirrorCount}/{graph.mirrors.length} linked
        </span>
      </div>

      <div className="mt-3 rounded border border-border bg-background p-2">
        <svg
          viewBox="0 0 1000 360"
          role="img"
          aria-label="Connector graph linking mirror entries to committed VIPS claims"
          className="h-[360px] w-full"
          data-testid="connector-graph"
        >
          <rect width="1000" height="360" rx="8" fill="transparent" />
          <text x="92" y="35" className="fill-muted-foreground font-sans text-[13px] font-semibold">
            mirrors
          </text>
          <text
            x="665"
            y="35"
            className="fill-muted-foreground font-sans text-[13px] font-semibold"
          >
            connector outcomes
          </text>
          <line x1="500" y1="54" x2="500" y2="326" stroke="currentColor" className="text-border" />

          {graph.edges.map((edge) => {
            const source = graph.mirrors.find((node) => node.id === edge.source)
            const target = graph.claims.find((node) => node.id === edge.target)
            if (!source || !target) return null
            const active = activeNodeId ? activeEdges.has(edge.id) : false
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                strokeWidth={active ? 3 : 1.5}
                stroke={active ? '#27221c' : '#b9b2a6'}
                strokeOpacity={activeNodeId && !active ? 0.18 : edge.forgotten ? 0.35 : 0.72}
                strokeDasharray={edge.forgotten ? '5 5' : undefined}
              >
                <title>
                  Mirror #{edge.sourceMirrorId} linked to {edge.targetClaimKey}
                  {edge.forgotten ? ' (forgotten)' : ''}
                </title>
              </line>
            )
          })}

          {graph.mirrors.map((node) => {
            const active =
              activeNodeId === node.id ||
              graph.edges.some((edge) => activeEdges.has(edge.id) && edge.source === node.id)
            return (
              <a
                key={node.id}
                href={`#${node.id}`}
                aria-label={`Mirror ${node.mirror.id}${node.linked ? ' linked' : ' unlinked'}`}
                onMouseEnter={() => setActiveNodeId(node.id)}
                onMouseLeave={() => setActiveNodeId(null)}
                onFocus={() => setActiveNodeId(node.id)}
                onBlur={() => setActiveNodeId(null)}
                onClick={(event) => event.preventDefault()}
                className="cursor-default outline-none"
              >
                <g>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={active ? 11 : 8}
                    fill={node.linked ? '#3b332b' : '#ddd8cf'}
                    stroke={active ? '#8c6fe8' : node.linked ? '#3b332b' : '#b9b2a6'}
                    strokeWidth={active ? 3 : 1.5}
                    opacity={activeNodeId && !active && node.linked ? 0.35 : 1}
                  />
                  <text
                    x={node.x}
                    y={node.y + 24}
                    textAnchor="middle"
                    className="fill-foreground text-[11px]"
                    opacity={activeNodeId && !active && node.linked ? 0.35 : 1}
                  >
                    #{node.mirror.id}
                  </text>
                  <title>
                    Mirror #{node.mirror.id}: {node.mirror.transcript}
                  </title>
                </g>
              </a>
            )
          })}

          {graph.claims.map((node) => {
            const active =
              activeNodeId === node.id ||
              graph.edges.some((edge) => activeEdges.has(edge.id) && edge.target === node.id)
            const fill = GRAPH_DIMENSION_COLORS[node.dimension] ?? '#3b332b'
            return (
              <a
                key={node.id}
                href={`#${node.id}`}
                aria-label={`${node.dimension} claim ${node.label}, ${node.count} links`}
                onMouseEnter={() => setActiveNodeId(node.id)}
                onMouseLeave={() => setActiveNodeId(null)}
                onFocus={() => setActiveNodeId(node.id)}
                onBlur={() => setActiveNodeId(null)}
                onClick={(event) => event.preventDefault()}
                className="cursor-default outline-none"
              >
                <g>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={active ? 12 : 9}
                    fill={fill}
                    stroke={active ? '#27221c' : fill}
                    strokeWidth={active ? 3 : 1.5}
                    opacity={activeNodeId && !active ? 0.35 : 1}
                  />
                  <text
                    x={node.x + 16}
                    y={node.y - 2}
                    className="fill-foreground text-[11px] font-semibold"
                    opacity={activeNodeId && !active ? 0.35 : 1}
                  >
                    {node.label}
                  </text>
                  <text
                    x={node.x + 16}
                    y={node.y + 13}
                    className="fill-muted-foreground text-[10px]"
                    opacity={activeNodeId && !active ? 0.35 : 1}
                  >
                    {node.dimension} · {node.count} link{node.count === 1 ? '' : 's'}
                  </text>
                  <title>
                    {node.dimension}.{node.claimId} from mirrors #{node.mirrorIds.join(', #')}
                  </title>
                </g>
              </a>
            )
          })}

          {!hasLinks ? (
            <g>
              <text
                x="500"
                y="170"
                textAnchor="middle"
                className="fill-muted-foreground font-sans text-[14px]"
              >
                No Connector links yet
              </text>
              <text
                x="500"
                y="194"
                textAnchor="middle"
                className="fill-muted-foreground text-[12px]"
              >
                Confirm Mirror entries, then run Connector.
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span>Mirrors {graph.mirrors.length}</span>
        <span>Claims {graph.claims.length}</span>
        <span>Links {graph.edges.length}</span>
        <span>Dashed lines are forgotten claims</span>
      </div>
      {graph.claims.length > 0 ? (
        <ol className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-4">
          {graph.claims.slice(0, 8).map((claim) => (
            <li key={claim.id} className="rounded border border-border bg-background px-2 py-1">
              <span className="font-semibold">{claim.dimension}</span> · {claim.label}
              <span className="ml-1 text-muted-foreground">← #{claim.mirrorIds.join(', #')}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

function buildConnectorGraph(mirrors: PipelineMirrorRow[]): ConnectorGraphModel {
  const visibleMirrors = mirrors.slice(0, 40)
  const claimMap = new Map<string, ConnectorGraphClaimNode>()
  const edges: ConnectorGraphEdge[] = []
  const mirrorPositions = radialPositions(visibleMirrors.length, 230, 185, 108)

  const mirrorNodes = visibleMirrors.map((mirror, index) => ({
    id: mirrorNodeId(mirror.id),
    mirror,
    x: mirrorPositions[index]?.x ?? 230,
    y: mirrorPositions[index]?.y ?? 185,
    linked: mirror.committed_timeline.length > 0,
  }))

  for (const mirror of visibleMirrors) {
    for (const entry of mirror.committed_timeline) {
      const key = connectorClaimKey(entry.dimension, entry.canonical_claim_id)
      const id = claimNodeId(key)
      const existing = claimMap.get(key)
      if (existing) {
        existing.count += 1
        existing.mirrorIds.push(mirror.id)
      } else {
        claimMap.set(key, {
          id,
          key,
          dimension: entry.dimension,
          claimId: entry.canonical_claim_id,
          label: shortClaimLabel(entry.canonical_claim_id),
          x: 0,
          y: 0,
          count: 1,
          mirrorIds: [mirror.id],
        })
      }
      edges.push({
        id: `${mirrorNodeId(mirror.id)}--${id}--${entry.id}`,
        source: mirrorNodeId(mirror.id),
        target: id,
        sourceMirrorId: mirror.id,
        targetClaimKey: key,
        forgotten: Boolean(entry.forgotten_at),
      })
    }
  }

  const claims = [...claimMap.values()].sort((a, b) => {
    const dimDelta = dimensionRank(a.dimension) - dimensionRank(b.dimension)
    if (dimDelta !== 0) return dimDelta
    return a.label.localeCompare(b.label)
  })
  const claimsByDimension = new Map<string, ConnectorGraphClaimNode[]>()
  for (const claim of claims) {
    const list = claimsByDimension.get(claim.dimension) ?? []
    list.push(claim)
    claimsByDimension.set(claim.dimension, list)
  }
  for (const [dimension, list] of claimsByDimension) {
    const dimIndex = dimensionRank(dimension)
    const column = dimIndex % 2
    const row = Math.floor(dimIndex / 2)
    const x = 620 + column * 190
    const centerY = 120 + row * 135
    const positions = verticalPositions(list.length, x, centerY, 28)
    list.forEach((claim, index) => {
      const point = positions[index]
      claim.x = point?.x ?? x
      claim.y = point?.y ?? centerY
    })
  }

  return {
    mirrors: mirrorNodes,
    claims,
    edges,
    linkedMirrorCount: mirrorNodes.filter((node) => node.linked).length,
  }
}

function radialPositions(count: number, centerX: number, centerY: number, radius: number) {
  if (count === 0) return []
  if (count === 1) return [{ x: centerX, y: centerY }]
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    }
  })
}

function verticalPositions(count: number, x: number, centerY: number, gap: number) {
  if (count === 0) return []
  const startY = centerY - ((count - 1) * gap) / 2
  return Array.from({ length: count }, (_, index) => ({ x, y: startY + index * gap }))
}

function mirrorNodeId(id: number) {
  return `mirror:${id}`
}

function claimNodeId(key: string) {
  return `claim:${key}`
}

function connectorClaimKey(dimension: string, claimId: string) {
  return `${dimension}:${claimId}`
}

function dimensionRank(dimension: string): number {
  const index = GRAPH_DIMENSIONS.indexOf(dimension as (typeof GRAPH_DIMENSIONS)[number])
  return index === -1 ? GRAPH_DIMENSIONS.length : index
}

function shortClaimLabel(claimId: string): string {
  const tail = claimId.split('.').at(-1) ?? claimId
  return tail.replace(/[_-]+/g, ' ')
}

function MirrorRow({
  mirror,
  open,
  onToggle,
}: {
  mirror: PipelineMirrorRow
  open: boolean
  onToggle: () => void
}) {
  const diffSummary = summarizeDiffs(mirror.diffs)
  return (
    <>
      <tr className="border-t border-border hover:bg-muted/30">
        <Td>{mirror.id}</Td>
        <Td>{formatTime(mirror.created_at)}</Td>
        <Td>{mirror.context_type}</Td>
        <Td>
          <StatusBadge value={mirror.review_status} />
        </Td>
        <Td className="max-w-0 truncate" title={mirror.transcript}>
          {mirror.transcript}
        </Td>
        <Td>{diffSummary}</Td>
        <Td>{mirror.committed_timeline.length}</Td>
        <Td>
          <button
            type="button"
            onClick={onToggle}
            className="rounded border border-border px-2 py-0.5 hover:bg-muted"
            aria-expanded={open}
          >
            {open ? 'hide' : 'show'}
          </button>
        </Td>
      </tr>
      {open ? <MirrorDetailRow mirror={mirror} /> : null}
    </>
  )
}

function MirrorDetailRow({ mirror }: { mirror: PipelineMirrorRow }) {
  return (
    <tr className="border-t border-border bg-muted/20">
      <td colSpan={8} className="px-3 py-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DetailBlock title="Mirror — validation">
            <p className="whitespace-pre-wrap">{mirror.validation}</p>
          </DetailBlock>
          <DetailBlock title="Mirror — inferred_meaning">
            <p className="whitespace-pre-wrap">{mirror.inferred_meaning}</p>
          </DetailBlock>
          <DetailBlock title="Mirror — story_reframe" className="lg:col-span-2">
            <p className="whitespace-pre-wrap">{mirror.story_reframe}</p>
          </DetailBlock>
          <DetailBlock title="Transcript (full)" className="lg:col-span-2">
            <p className="whitespace-pre-wrap">{mirror.transcript}</p>
          </DetailBlock>
          <DetailBlock title={`Verifier diffs (${mirror.diffs.length})`} className="lg:col-span-2">
            {mirror.diffs.length === 0 ? (
              <p className="text-muted-foreground">No Connector run touched this mirror entry.</p>
            ) : (
              <ul className="space-y-2">
                {mirror.diffs.map((d) => (
                  <li key={d.id} className="rounded border border-border bg-background p-2">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span>
                        diff #{d.id} · <StatusBadge value={d.status} />
                      </span>
                      <span className="text-muted-foreground">{formatTime(d.created_at)}</span>
                    </div>
                    <LazyBlob label="payload" value={d.payload} />
                    <LazyBlob label="verifier_result" value={d.verifier_result} />
                  </li>
                ))}
              </ul>
            )}
          </DetailBlock>
          <DetailBlock
            title={`Committed claims (${mirror.committed_timeline.length})`}
            className="lg:col-span-2"
          >
            {mirror.committed_timeline.length === 0 ? (
              <p className="text-muted-foreground">No claims committed from this entry yet.</p>
            ) : (
              <ul className="space-y-1">
                {mirror.committed_timeline.map((t) => {
                  const parallax = Array.isArray(t.parallax_tag) ? t.parallax_tag : []
                  return (
                    <li key={t.id} className="rounded bg-background px-2 py-1">
                      <span className="font-semibold">{t.dimension}</span> · {t.canonical_claim_id}{' '}
                      · <span className="text-muted-foreground">strength={t.strength}</span> ·{' '}
                      parallax=[{parallax.join(', ')}]
                      {t.forgotten_at ? (
                        <span className="ml-1 rounded bg-warning/20 px-1 text-warning">
                          forgotten
                        </span>
                      ) : null}
                      <div className="mt-0.5 text-muted-foreground">“{t.verbatim_quote}”</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </DetailBlock>
        </div>
      </td>
    </tr>
  )
}

function CartographerCard({ cartographer }: { cartographer: CartographerOutputRow | null }) {
  if (!cartographer) {
    return (
      <section className="mb-4 rounded border border-dashed border-border bg-muted/30 px-3 py-2">
        <h2 className="font-sans text-sm font-semibold">Cartographer</h2>
        <p className="text-muted-foreground">
          No Cartographer run yet for this student. Trajectory synthesizes once enough verified
          evidence accumulates.
        </p>
      </section>
    )
  }
  return (
    <section className="mb-4 rounded border border-border bg-muted/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-sans text-sm font-semibold">Cartographer · latest Trajectory</h2>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(cartographer.created_at)} · #{cartographer.id}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap">{cartographer.trajectory_text}</p>
      {cartographer.pathways.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            pathways ({cartographer.pathways.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {cartographer.pathways.map((p) => {
              const traits = Array.isArray(p.trait_combination) ? p.trait_combination : []
              return (
                <li key={p.label} className="rounded bg-background px-2 py-1">
                  <div className="font-semibold">{p.label}</div>
                  <div className="mt-0.5 text-muted-foreground">
                    traits: {traits.map((t) => `${t.dimension}.${t.claim_id}`).join(', ') || '—'}
                  </div>
                  {p.risks_tradeoffs ? (
                    <div className="mt-0.5">risks: {p.risks_tradeoffs}</div>
                  ) : null}
                  {p.exploration_prompt ? (
                    <div className="mt-0.5">→ {p.exploration_prompt}</div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </details>
      ) : null}
      {cartographer.open_questions.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-muted-foreground">
          {cartographer.open_questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function FilterPills({
  filter,
  onChange,
}: {
  filter: FilterState
  onChange: (next: FilterState) => void
}) {
  const options: FilterState[] = ['all', 'pending', 'confirmed', 'forgotten']
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'rounded border border-border px-2 py-0.5 text-xs',
            filter === opt ? 'bg-foreground text-background' : 'bg-background hover:bg-muted',
          )}
          aria-pressed={filter === opt}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'confirmed'
      ? 'bg-emerald-500/15 text-emerald-700'
      : value === 'ok'
        ? 'bg-emerald-500/15 text-emerald-700'
        : value === 'running'
          ? 'bg-blue-500/15 text-blue-700'
          : value === 'error'
            ? 'bg-warning/20 text-warning'
            : value === 'forgotten'
              ? 'bg-zinc-500/15 text-zinc-700'
              : 'bg-amber-500/15 text-amber-700'
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide', tone)}>
      {value}
    </span>
  )
}

function connectorStatusCopy(
  status: string,
  processed: number,
  succeeded: number,
  failed: number,
  remaining: number,
): string {
  if (status === 'ok') {
    return `Connector applied ${succeeded}/${processed} confirmed reflections.`
  }
  if (status === 'nothing_to_run') return 'Connector found no confirmed reflections to link.'
  if (status === 'partial') {
    const failureCopy = failed > 0 ? `; ${failed} failed` : ''
    return `Connector applied ${succeeded}/${processed}${failureCopy}; ${remaining} left.`
  }
  if (status === 'timeout') return 'Connector timed out.'
  if (status === 'schema_reject') return 'Connector returned an invalid diff.'
  if (status === 'transport_error') return 'Connector transport failed.'
  if (status === 'auth_error') return 'Connector auth failed.'
  return `Connector finished with ${status}.`
}

function makeActionLogEntry(
  text: string,
  tone: PipelineActionLogEntry['tone'],
): PipelineActionLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    at: new Date().toISOString(),
    tone,
    text,
  }
}

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso))
}

function truncateForLog(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > 96 ? `${clean.slice(0, 93)}...` : clean
}

function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

function summarizeRunEvent(event: RunStepEvent): string {
  switch (event.type) {
    case 'agent_started':
      return `${event.agent} started`
    case 'tool_call_started':
      return `${event.agent} called ${event.toolName}`
    case 'tool_call_completed':
      return `${event.agent} finished ${event.toolName}`
    case 'message_output':
      return `${event.agent} output ${event.preview}`
    case 'reasoning':
      return `${event.agent} reasoning`
    case 'handoff':
      return `${event.from} handed off to ${event.to}`
    case 'agent_completed':
      return `${event.agent} completed`
    case 'run_completed':
      return event.partial ? 'run completed with partial output' : 'run completed'
    case 'error':
      return `${event.agent} error: ${event.message}`
  }
}

function DetailBlock({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded border border-border bg-background p-2', className)}>
      <div className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  )
}

function LazyBlob({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      {open ? (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2">
          {safeStringify(value)}
        </pre>
      ) : null}
    </details>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
  colSpan,
  title,
}: {
  children?: React.ReactNode
  className?: string
  colSpan?: number
  title?: string
}) {
  return (
    <td className={cn('px-2 py-1.5 align-top', className)} colSpan={colSpan} title={title}>
      {children}
    </td>
  )
}

function summarizeDiffs(diffs: VipsProposedDiffRow[]): string {
  if (diffs.length === 0) return '0'
  const counts = { pending: 0, confirmed: 0, forgotten: 0 }
  for (const d of diffs) counts[d.status]++
  const parts: string[] = []
  if (counts.confirmed) parts.push(`${counts.confirmed}c`)
  if (counts.pending) parts.push(`${counts.pending}p`)
  if (counts.forgotten) parts.push(`${counts.forgotten}f`)
  return `${diffs.length} (${parts.join(' / ')})`
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toISOString().replace('T', ' ').replace(/\..+$/, '')
  } catch {
    return iso
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
