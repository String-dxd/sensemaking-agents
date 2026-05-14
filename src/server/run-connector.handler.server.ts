import { requireCounselorContext } from '~/auth/identity'
import { listAttachedStudentIds, listUnconnectedMirrorEntries } from '~/db/queries'
import {
  type AutoConnectorDeps,
  type AutoConnectorResult,
  type AutoConnectorStatus,
  runAutoConnectorAfterMirror,
} from '~/server/auto-connector.handler.server'
import { type RunConnectorInput, runConnectorInputSchema } from './function-schemas'

const DEFAULT_CONNECTOR_BATCH_LIMIT = 5

export type RunConnectorStatus =
  | 'ok'
  | 'nothing_to_run'
  | 'partial'
  | 'timeout'
  | 'schema_reject'
  | 'transport_error'
  | 'auth_error'
  | 'unknown'
  | 'missing_mirror'

export interface RunConnectorEntryResult {
  mirror_entry_id: number
  status: AutoConnectorStatus
  staged_diff_id: number | null
}

export interface RunConnectorResult {
  status: RunConnectorStatus
  processed: number
  succeeded: number
  failed: number
  remaining: number
  entries: RunConnectorEntryResult[]
}

export interface RunConnectorDeps {
  requireContext?: typeof requireCounselorContext
  listUnconnectedMirrorEntries?: typeof listUnconnectedMirrorEntries
  runConnectorForEntry?: (
    studentId: string,
    mirrorEntryId: number,
    deps?: AutoConnectorDeps,
  ) => Promise<AutoConnectorResult>
  autoConnector?: AutoConnectorDeps
}

export interface RunConnectorForStudentDeps extends Omit<RunConnectorDeps, 'requireContext'> {}

export async function runConnectorHandler(
  data: RunConnectorInput,
  deps: RunConnectorDeps = {},
): Promise<RunConnectorResult> {
  const parsed = runConnectorInputSchema.parse(data)
  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()
  return runConnectorForStudent(studentId, parsed, deps)
}

export async function runConnectorForStudent(
  studentId: string,
  input: RunConnectorInput = {},
  deps: RunConnectorForStudentDeps = {},
): Promise<RunConnectorResult> {
  const limit = input.limit ?? DEFAULT_CONNECTOR_BATCH_LIMIT
  const listEntries = deps.listUnconnectedMirrorEntries ?? listUnconnectedMirrorEntries
  const candidates = await listEntries(studentId, { limit: limit + 1 })
  const confirmedCandidates = candidates.filter((entry) => entry.review_status === 'confirmed')
  const entriesToProcess = confirmedCandidates.slice(0, limit)
  const remainingFromInitialBatch = Math.max(
    confirmedCandidates.length - entriesToProcess.length,
    0,
  )

  if (entriesToProcess.length === 0) {
    return {
      status: 'nothing_to_run',
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
      entries: [],
    }
  }

  const runOne = deps.runConnectorForEntry ?? runAutoConnectorAfterMirror
  const entries: RunConnectorEntryResult[] = []

  for (const mirrorEntry of entriesToProcess) {
    const result = await runOne(studentId, mirrorEntry.id, deps.autoConnector)
    entries.push({
      mirror_entry_id: mirrorEntry.id,
      status: result.status,
      staged_diff_id: result.staged_diff?.id ?? null,
    })
  }

  const succeeded = entries.filter((entry) => entry.status === 'ok').length
  const failed = entries.length - succeeded
  const status = aggregateStatus(entries, remainingFromInitialBatch)

  return {
    status,
    processed: entries.length,
    succeeded,
    failed,
    remaining: remainingFromInitialBatch,
    entries,
  }
}

export interface RunConnectorCronDeps extends RunConnectorForStudentDeps {
  listAttachedStudentIds?: typeof listAttachedStudentIds
}

export interface RunConnectorCronResult {
  ok: boolean
  status: 'ok' | 'nothing_to_run' | 'partial' | 'auth_error'
  students: Array<{ student_id: string; result: RunConnectorResult }>
  processed: number
  succeeded: number
  failed: number
  remaining: number
}

export async function runConnectorCronHandler(
  request: Request,
  deps: RunConnectorCronDeps = {},
): Promise<Response> {
  if (!isAuthorizedCronRequest(request)) {
    const body: RunConnectorCronResult = {
      ok: false,
      status: 'auth_error',
      students: [],
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
    }
    return Response.json(body, { status: 401 })
  }

  const listStudents = deps.listAttachedStudentIds ?? listAttachedStudentIds
  const studentIds = await listStudents()
  const students: RunConnectorCronResult['students'] = []

  for (const studentId of studentIds) {
    const result = await runConnectorForStudent(studentId, {}, deps)
    if (result.status !== 'nothing_to_run') {
      students.push({ student_id: studentId, result })
    }
  }

  const processed = students.reduce((sum, item) => sum + item.result.processed, 0)
  const succeeded = students.reduce((sum, item) => sum + item.result.succeeded, 0)
  const failed = students.reduce((sum, item) => sum + item.result.failed, 0)
  const remaining = students.reduce((sum, item) => sum + item.result.remaining, 0)
  const status = processed === 0 ? 'nothing_to_run' : failed > 0 || remaining > 0 ? 'partial' : 'ok'

  return Response.json({
    ok: failed === 0,
    status,
    students,
    processed,
    succeeded,
    failed,
    remaining,
  } satisfies RunConnectorCronResult)
}

function aggregateStatus(
  entries: RunConnectorEntryResult[],
  remaining: number,
): RunConnectorStatus {
  if (entries.length === 0) return 'nothing_to_run'
  const failures = entries.filter((entry) => entry.status !== 'ok')
  if (failures.length === 0) return remaining > 0 ? 'partial' : 'ok'
  if (failures.length < entries.length) return 'partial'
  const firstStatus = failures[0]?.status
  if (remaining > 0 && firstStatus === 'queued') return 'partial'
  return firstStatus === 'queued' ? 'partial' : (firstStatus ?? 'unknown')
}

function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('Authorization') === `Bearer ${secret}`
}
