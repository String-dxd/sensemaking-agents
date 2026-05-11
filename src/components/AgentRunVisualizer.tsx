import { useEffect, useState } from 'react'
import type { AgentName, RunStepEvent } from '~/agents/run-events'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

/**
 * Live(-ish) visualization of the Cartographer sense-making run.
 *
 * The server fn returns events with their captured timestamps after the
 * actual run completes. We replay them client-side with a small synthetic
 * floor between consecutive events (so the eye can follow), preserving the
 * relative timing of agent transitions and tool calls.
 *
 * v0.2 single-card layout (U10): in v0.1 this view rendered two cards
 * (Connector + Pathfinder) with an explicit handoff pill between them.
 * The v0.2 wiki flow makes Connector run automatically per-mirror (U7), so
 * this view is now a **single Cartographer card** showing only the
 * manual-button run. Connector events that arrive (e.g. from the streamed
 * orchestrator) are ignored here — the Cartographer card consumes only
 * `agent === 'cartographer'` events.
 */

const MIN_GAP_MS = 220
const MAX_GAP_MS = 1100

export interface AgentRunVisualizerProps {
  events: RunStepEvent[]
  /** Set to false to render all events immediately (for component tests). */
  animate?: boolean
  /** Fired exactly once when the playback reaches run_completed. */
  onPlaybackComplete?: () => void
}

export function AgentRunVisualizer({
  events,
  animate = true,
  onPlaybackComplete,
}: AgentRunVisualizerProps) {
  const [playedCount, setPlayedCount] = useState(animate ? 0 : events.length)

  // biome-ignore lint/correctness/useExhaustiveDependencies: events is captured snapshot; replay is intentional.
  useEffect(() => {
    if (!animate) {
      setPlayedCount(events.length)
      return
    }
    setPlayedCount(0)
    let cancelled = false
    let i = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const advance = () => {
      if (cancelled) return
      if (i >= events.length) {
        onPlaybackComplete?.()
        return
      }
      i++
      setPlayedCount(i)
      if (i >= events.length) {
        onPlaybackComplete?.()
        return
      }
      const cur = events[i - 1]
      const next = events[i]
      if (!cur || !next) return
      const realGap = Math.max(0, next.timestampMs - cur.timestampMs)
      const synthetic = Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, realGap))
      timer = setTimeout(advance, synthetic)
    }

    timer = setTimeout(advance, 80)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [events, animate])

  const visible = events.slice(0, playedCount)
  const activeAgent = computeActiveAgent(visible)

  return (
    <div className="flex flex-col gap-3" data-testid="agent-run-visualizer">
      <AgentCard
        agent="cartographer"
        title="Cartographer"
        subtitle="Trajectory + pathways"
        events={visible.filter((e) => agentScope(e) === 'cartographer')}
        active={activeAgent === 'cartographer'}
      />
      {visible.some((e) => e.type === 'run_completed') ? (
        <p className="self-center text-xs text-muted-foreground">
          run complete · cards refresh below
        </p>
      ) : null}
      {visible.some((e) => e.type === 'error') ? (
        <p className="self-center text-xs text-warning" role="alert">
          {(visible.find((e) => e.type === 'error') as { message?: string } | undefined)?.message ??
            'something went wrong'}
        </p>
      ) : null}
    </div>
  )
}

function AgentCard({
  agent,
  title,
  subtitle,
  events,
  active,
}: {
  agent: AgentName
  title: string
  subtitle: string
  events: RunStepEvent[]
  active: boolean
}) {
  const completed = events.some((e) => e.type === 'agent_completed')
  return (
    <Card
      className={`relative overflow-hidden transition-all ${
        active ? 'ring-2 ring-accent/60 shadow-md' : completed ? 'opacity-90' : 'opacity-70'
      }`}
      data-testid={`agent-card-${agent}`}
      data-active={active ? 'true' : 'false'}
    >
      {active ? (
        <div
          className="pointer-events-none absolute inset-0 animate-pulse bg-accent/5"
          aria-hidden
        />
      ) : null}
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span>
            {title}
            <span className="ml-2 text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
              looking forward
            </span>
          </span>
          <span
            className={`text-[10px] uppercase tracking-wider ${
              completed
                ? 'text-muted-foreground'
                : active
                  ? 'text-accent'
                  : 'text-muted-foreground/60'
            }`}
          >
            {completed ? 'done' : active ? 'thinking…' : 'queued'}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          events.map((ev) => <EventRow key={`${agent}-${ev.timestampMs}-${ev.type}`} event={ev} />)
        )}
      </CardContent>
    </Card>
  )
}

function EventRow({ event }: { event: RunStepEvent }) {
  if (event.type === 'agent_started') {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="text-accent">▸</span> started · {fmtTime(event.timestampMs)}
      </p>
    )
  }
  if (event.type === 'tool_call_started') {
    return (
      <p className="text-xs leading-relaxed">
        <span className="text-accent">⚙︎</span>{' '}
        <code className="rounded bg-muted px-1 text-[10px]">{event.toolName}</code>{' '}
        <span className="text-muted-foreground">{event.argsPreview}</span>
      </p>
    )
  }
  if (event.type === 'tool_call_completed') {
    return (
      <p className="text-xs leading-relaxed">
        <span className="text-accent">←</span>{' '}
        <code className="rounded bg-muted px-1 text-[10px]">{event.toolName}</code>{' '}
        <span className="text-muted-foreground">→ {event.resultPreview}</span>
      </p>
    )
  }
  if (event.type === 'message_output' && event.preview.trim().length > 0) {
    return <p className="text-xs italic text-muted-foreground">“{event.preview}”</p>
  }
  if (event.type === 'reasoning') {
    return <p className="text-xs text-muted-foreground">· thinking …</p>
  }
  if (event.type === 'agent_completed') {
    return (
      <p className="text-xs text-foreground">
        <span className="text-accent">✓</span> done · {fmtTime(event.timestampMs)}
        {event.outputPreview ? (
          <>
            {' '}
            <span className="text-muted-foreground">{event.outputPreview}</span>
          </>
        ) : null}
      </p>
    )
  }
  if (event.type === 'error') {
    return (
      <p className="text-xs text-warning" role="alert">
        ⚠ {event.message}
      </p>
    )
  }
  return null
}

function agentScope(event: RunStepEvent): AgentName | 'meta' {
  if (event.type === 'handoff') return 'meta'
  if (event.type === 'run_completed') return 'meta'
  if (event.type === 'error') return event.agent === 'chain' ? 'meta' : event.agent
  return event.agent
}

function computeActiveAgent(events: RunStepEvent[]): AgentName | null {
  if (events.length === 0) return null
  if (events.some((e) => e.type === 'run_completed')) return null
  // Walk backwards to find the most recent agent_started not yet followed by an agent_completed.
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (!ev) continue
    if (ev.type === 'agent_completed') {
      // Look forward for any later agent_started; if none, no agent active.
      const laterStart = events.slice(i + 1).find((e) => e.type === 'agent_started')
      return laterStart && laterStart.type === 'agent_started' ? laterStart.agent : null
    }
    if (ev.type === 'agent_started') {
      return ev.agent
    }
  }
  return null
}

function fmtTime(ms: number): string {
  const s = (ms / 1000).toFixed(1)
  return `${s}s`
}
