import { useSyncExternalStore } from 'react'
import {
  type DebugAgentRun,
  type DebugAgentStatus,
  getAgentDebugServerSnapshot,
  getAgentDebugSnapshot,
  subscribeAgentDebug,
} from '~/agents/run-status'

export function AgentDebugPanel() {
  const snapshot = useSyncExternalStore(
    subscribeAgentDebug,
    getAgentDebugSnapshot,
    getAgentDebugServerSnapshot,
  )

  return (
    <details
      className="rounded-md border border-border/40 bg-muted/10 text-xs"
      data-testid="agent-debug-panel"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <span className="font-medium">agent debug</span>
        <span
          className={
            snapshot.runningCount > 0 ? 'font-medium text-accent' : 'text-muted-foreground'
          }
          data-testid="agent-debug-summary"
        >
          {snapshot.runningCount > 0 ? `${snapshot.runningCount} running` : 'idle'}
        </span>
      </summary>
      <div className="grid gap-2 border-t border-border/40 px-3 py-3 sm:grid-cols-3">
        {snapshot.runs.map((run) => (
          <AgentDebugRow key={run.name} run={run} />
        ))}
      </div>
    </details>
  )
}

function AgentDebugRow({ run }: { run: DebugAgentRun }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-border/30 bg-background/60 p-3">
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
