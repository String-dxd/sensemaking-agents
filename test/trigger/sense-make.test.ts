import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { senseMakePayloadSchema } from '~/../trigger/sense-make'
import { scheduleOnboardHandler } from '~/server/schedule-onboard.handler.server'
import { triggerCronHandler } from '~/server/trigger-cron.handler.server'

vi.mock('@trigger.dev/sdk/v3', async () => {
  return {
    schedules: {
      create: vi.fn(async (opts: unknown) => {
        const o = opts as { externalId: string; cron: string }
        return {
          id: `sched_${o.externalId}`,
          externalId: o.externalId,
          cron: o.cron,
        }
      }),
    },
    tasks: {
      trigger: vi.fn(async () => ({
        id: 'run_test_123',
        publicAccessToken: 'tk_test_xyz',
      })),
    },
    task: vi.fn((opts: unknown) => opts), // pass-through
    defineConfig: vi.fn((c: unknown) => c),
  }
})

const originalNodeEnv = process.env.NODE_ENV

beforeEach(() => {
  process.env.NODE_ENV = 'development'
})

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv
  vi.clearAllMocks()
})

describe('sense-make task payload', () => {
  it('accepts a non-empty studentId', () => {
    expect(senseMakePayloadSchema.parse({ studentId: 'demo' })).toEqual({ studentId: 'demo' })
  })

  it('rejects an empty studentId', () => {
    expect(() => senseMakePayloadSchema.parse({ studentId: '' })).toThrow()
  })

  it('rejects a missing studentId', () => {
    expect(() => senseMakePayloadSchema.parse({})).toThrow()
  })
})

describe('scheduleOnboardHandler', () => {
  it('creates a per-student schedule with the studentId as externalId (idempotent via deduplicationKey)', async () => {
    const result = await scheduleOnboardHandler({ studentId: 'demo', cron: '0 3 * * *' })
    expect(result).toEqual({
      scheduleId: 'sched_demo',
      externalId: 'demo',
      cron: '0 3 * * *',
    })
  })

  it('defaults the cron to nightly 03:00 when omitted', async () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing default branch
    const result = await scheduleOnboardHandler({ studentId: 'demo' } as any)
    expect(result.cron).toBe('0 3 * * *')
  })

  it('rejects an empty studentId at the schema boundary', async () => {
    await expect(scheduleOnboardHandler({ studentId: '', cron: '0 3 * * *' })).rejects.toThrow()
  })
})

describe('triggerCronHandler (dev-only)', () => {
  it('triggers the sense-make task with the studentId payload and returns a run id', async () => {
    const result = await triggerCronHandler({ studentId: 'demo' })
    expect(result.runId).toBe('run_test_123')
  })

  it('refuses to run in production', async () => {
    process.env.NODE_ENV = 'production'
    await expect(triggerCronHandler({ studentId: 'demo' })).rejects.toThrowError(/dev-only/)
  })
})
