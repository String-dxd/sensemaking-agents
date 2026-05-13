export type DebugAgentName = 'mirror' | 'connector' | 'cartographer'
export type DebugAgentStatus = 'idle' | 'running' | 'succeeded' | 'queued' | 'skipped' | 'failed'

export interface DebugAgentRun {
  name: DebugAgentName
  label: string
  status: DebugAgentStatus
  detail: string
  startedAt: number | null
  updatedAt: number | null
  finishedAt: number | null
}

export interface DebugAgentSnapshot {
  runs: DebugAgentRun[]
  runningCount: number
}

const AGENT_LABELS: Record<DebugAgentName, string> = {
  mirror: 'Mirror',
  connector: 'Connector',
  cartographer: 'Cartographer',
}

const AGENT_ORDER: DebugAgentName[] = ['mirror', 'connector', 'cartographer']

const listeners = new Set<() => void>()
let runs = AGENT_ORDER.map((name) => initialRun(name))
let snapshot = buildSnapshot()

export function subscribeAgentDebug(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAgentDebugSnapshot(): DebugAgentSnapshot {
  return snapshot
}

export function getAgentDebugServerSnapshot(): DebugAgentSnapshot {
  return snapshot
}

export function startAgentRun(name: DebugAgentName, detail: string): void {
  const now = Date.now()
  updateRun(name, {
    status: 'running',
    detail,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  })
}

export function finishAgentRun(
  name: DebugAgentName,
  status: Exclude<DebugAgentStatus, 'idle' | 'running'>,
  detail: string,
): void {
  const now = Date.now()
  updateRun(name, {
    status,
    detail,
    updatedAt: now,
    finishedAt: now,
  })
}

export function resetAgentDebugForTests(): void {
  runs = AGENT_ORDER.map((name) => initialRun(name))
  publish()
}

function updateRun(name: DebugAgentName, patch: Partial<DebugAgentRun>): void {
  runs = runs.map((run) => (run.name === name ? { ...run, ...patch } : run))
  publish()
}

function publish(): void {
  snapshot = buildSnapshot()
  for (const listener of listeners) listener()
}

function buildSnapshot(): DebugAgentSnapshot {
  const copiedRuns = runs.map((run) => ({ ...run }))
  return {
    runs: copiedRuns,
    runningCount: copiedRuns.filter((run) => run.status === 'running').length,
  }
}

function initialRun(name: DebugAgentName): DebugAgentRun {
  return {
    name,
    label: AGENT_LABELS[name],
    status: 'idle',
    detail: 'No run in this tab yet.',
    startedAt: null,
    updatedAt: null,
    finishedAt: null,
  }
}
