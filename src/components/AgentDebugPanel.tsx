import { Activity } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import {
  type DebugAgentRun,
  type DebugAgentStatus,
  getAgentDebugServerSnapshot,
  getAgentDebugSnapshot,
  subscribeAgentDebug,
} from '~/agents/run-status'
import { cn } from '~/lib/utils'

export function AgentDebugPanel() {
  const snapshot = useAgentDebugSnapshot()

  return (
    <details
      className="rounded-md border border-border/40 bg-muted/10 text-xs"
      data-testid="agent-debug-panel"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className="font-medium">agent debug</span>
        <AgentDebugSummary runningCount={snapshot.runningCount} />
      </summary>
      <div className="border-t border-border/40 px-3 py-3">
        <AgentDebugGrid runs={snapshot.runs} />
      </div>
    </details>
  )
}

export function FloatingAgentDebugPanel({ align = 'right' }: { align?: 'left' | 'right' }) {
  const snapshot = useAgentDebugSnapshot()

  return (
    <details className="pointer-events-auto relative" data-testid="agent-debug-panel">
      <summary
        aria-label="Open agent debug"
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-[0_1px_3px_rgba(15,23,42,0.12)] backdrop-blur transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
        data-testid="floating-agent-debug-trigger"
        title="Agent debug"
      >
        <Activity aria-hidden className="h-4 w-4" />
        {snapshot.runningCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground"
            data-testid="floating-agent-debug-count"
          >
            {snapshot.runningCount}
          </span>
        ) : null}
        <span className="sr-only">Agent debug</span>
      </summary>
      <div
        className={cn(
          'absolute z-30 mt-2 w-[min(88vw,32rem)] rounded-lg border border-border bg-background/95 p-3 text-xs text-foreground shadow-lg backdrop-blur',
          align === 'left' ? 'left-0' : 'right-0',
        )}
        data-testid="floating-agent-debug-menu"
      >
        <div className="flex items-center justify-between gap-4">
          <p className="font-semibold text-foreground">agent debug</p>
          <AgentDebugSummary floating runningCount={snapshot.runningCount} />
        </div>
        <div className="mt-3 border-t border-border/50 pt-3">
          <AgentDebugGrid floating runs={snapshot.runs} />
        </div>
      </div>
    </details>
  )
}

function useAgentDebugSnapshot() {
  return useSyncExternalStore(
    subscribeAgentDebug,
    getAgentDebugSnapshot,
    getAgentDebugServerSnapshot,
  )
}

function AgentDebugSummary({
  runningCount,
  floating = false,
}: {
  runningCount: number
  floating?: boolean
}) {
  const isRunning = runningCount > 0

  return (
    <span
      className={cn(
        isRunning ? 'font-medium text-accent' : 'text-muted-foreground',
        floating && isRunning && 'text-accent',
      )}
      data-testid="agent-debug-summary"
    >
      {isRunning ? `${runningCount} running` : 'idle'}
    </span>
  )
}

function AgentDebugGrid({ runs, floating = false }: { runs: DebugAgentRun[]; floating?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {runs.map((run) => (
        <AgentDebugRow floating={floating} key={run.name} run={run} />
      ))}
    </div>
  )
}

function AgentDebugRow({ run, floating = false }: { run: DebugAgentRun; floating?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded border border-border/30 bg-background/60 p-3',
        floating && 'rounded-md border-border/40 bg-muted/20 p-3',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{run.label}</span>
        <StatusPill status={run.status} />
      </div>
      <p className="min-h-8 leading-relaxed text-muted-foreground">{run.detail}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {formatTimestamp(run)}
      </p>
    </div>
  )
}

function StatusPill({ status }: { status: DebugAgentStatus }) {
  const className =
    status === 'running'
      ? 'bg-accent/15 text-accent'
      : status === 'failed'
        ? 'bg-warning/15 text-warning'
        : status === 'succeeded'
          ? 'bg-muted text-foreground'
          : 'bg-muted text-muted-foreground'

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
    >
      {status}
    </span>
  )
}

function formatTimestamp(run: DebugAgentRun): string {
  const timestamp = run.finishedAt ?? run.updatedAt ?? run.startedAt
  if (!timestamp) return 'not started'
  return new Date(timestamp).toLocaleTimeString()
}
