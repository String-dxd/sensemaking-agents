import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MirrorEntryRow } from '~/db/queries'
import type { AutoConnectorResult } from '~/server/auto-connector.handler.server'
import {
  runConnectorCronHandler,
  runConnectorForStudent,
  runConnectorHandler,
} from '~/server/run-connector.handler.server'

function mirrorEntry(
  id: number,
  reviewStatus: MirrorEntryRow['review_status'] = 'confirmed',
): MirrorEntryRow {
  return {
    id,
    student_id: 'demo',
    transcript: `transcript ${id}`,
    validation: '',
    inferred_meaning: '',
    story_reframe: '',
    raw_output_json: '{}',
    context_type: 'school',
    review_status: reviewStatus,
    tags: [],
    created_at: '2026-05-13T00:00:00.000Z',
  }
}

function connectorResult(status: AutoConnectorResult['status']): AutoConnectorResult {
  return {
    status,
    staged_diff:
      status === 'ok'
        ? ({
            id: 99,
            status: 'confirmed',
          } as AutoConnectorResult['staged_diff'])
        : null,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('runConnectorHandler', () => {
  it('uses the auth-derived student and processes one unconnected reflection', async () => {
    const requireContext = vi.fn(async () => ({ counselorId: 'counselor', studentId: 'demo-c' }))
    const listUnconnectedMirrorEntries = vi.fn(async () => [mirrorEntry(7)])
    const runConnectorForEntry = vi.fn(async () => connectorResult('ok'))

    const result = await runConnectorHandler(
      {},
      { requireContext, listUnconnectedMirrorEntries, runConnectorForEntry },
    )

    expect(result.status).toBe('ok')
    expect(result.processed).toBe(1)
    expect(result.succeeded).toBe(1)
    expect(listUnconnectedMirrorEntries).toHaveBeenCalledWith('demo-c', { limit: 6 })
    expect(runConnectorForEntry).toHaveBeenCalledWith('demo-c', 7, undefined)
  })

  it('returns nothing_to_run when no unconnected reflections exist', async () => {
    const result = await runConnectorForStudent(
      'demo',
      {},
      { listUnconnectedMirrorEntries: vi.fn(async () => []) },
    )

    expect(result.status).toBe('nothing_to_run')
    expect(result.processed).toBe(0)
  })

  it('does not dispatch Connector for reflections still waiting on review', async () => {
    const runConnectorForEntry = vi.fn(async () => connectorResult('ok'))

    const result = await runConnectorForStudent(
      'demo',
      {},
      {
        listUnconnectedMirrorEntries: vi.fn(async () => [mirrorEntry(7, 'pending')]),
        runConnectorForEntry,
      },
    )

    expect(result.status).toBe('nothing_to_run')
    expect(result.processed).toBe(0)
    expect(runConnectorForEntry).not.toHaveBeenCalled()
  })

  it('returns partial when the batch cap leaves reflections waiting', async () => {
    const result = await runConnectorForStudent(
      'demo',
      { limit: 2 },
      {
        listUnconnectedMirrorEntries: vi.fn(async () => [
          mirrorEntry(1),
          mirrorEntry(2),
          mirrorEntry(3),
        ]),
        runConnectorForEntry: vi.fn(async () => connectorResult('ok')),
      },
    )

    expect(result.status).toBe('partial')
    expect(result.processed).toBe(2)
    expect(result.remaining).toBe(1)
  })

  it('keeps going after a failed entry and reports partial failure', async () => {
    const runConnectorForEntry = vi
      .fn()
      .mockResolvedValueOnce(connectorResult('ok'))
      .mockResolvedValueOnce(connectorResult('timeout'))

    const result = await runConnectorForStudent(
      'demo',
      {},
      {
        listUnconnectedMirrorEntries: vi.fn(async () => [mirrorEntry(1), mirrorEntry(2)]),
        runConnectorForEntry,
      },
    )

    expect(result.status).toBe('partial')
    expect(result.succeeded).toBe(1)
    expect(result.failed).toBe(1)
  })

  it('reports the concrete failure when every processed entry fails despite backlog', async () => {
    const result = await runConnectorForStudent(
      'demo',
      { limit: 2 },
      {
        listUnconnectedMirrorEntries: vi.fn(async () => [
          mirrorEntry(1),
          mirrorEntry(2),
          mirrorEntry(3),
        ]),
        runConnectorForEntry: vi.fn(async () => connectorResult('timeout')),
      },
    )

    expect(result.status).toBe('timeout')
    expect(result.processed).toBe(2)
    expect(result.failed).toBe(2)
    expect(result.remaining).toBe(1)
  })
})

describe('runConnectorCronHandler', () => {
  it('rejects requests without the CRON_SECRET bearer token', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    const response = await runConnectorCronHandler(
      new Request('https://app.test/api/cron/run-connector'),
    )

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.status).toBe('auth_error')
  })

  it('runs batches across attached students after CRON_SECRET auth', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    const request = new Request('https://app.test/api/cron/run-connector', {
      headers: { Authorization: 'Bearer secret' },
    })
    const response = await runConnectorCronHandler(request, {
      listAttachedStudentIds: vi.fn(async () => ['demo-a', 'demo-b']),
      listUnconnectedMirrorEntries: vi.fn(async (studentId) =>
        studentId === 'demo-a' ? [mirrorEntry(1)] : [],
      ),
      runConnectorForEntry: vi.fn(async () => connectorResult('ok')),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.processed).toBe(1)
    expect(body.students).toHaveLength(1)
    expect(body.students[0].student_id).toBe('demo-a')
  })
})
