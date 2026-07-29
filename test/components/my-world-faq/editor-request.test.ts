import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchEditorJsonWithDeadline,
  MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS,
} from '~/components/my-world-faq/editor/editor-request'

describe('FAQ editor request deadline', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('keeps the deadline active while the response body is being read', async () => {
    vi.useFakeTimers()
    const response = {
      json: () => new Promise<never>(() => undefined),
    } as unknown as Response
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response)

    const request = fetchEditorJsonWithDeadline<{ ok: true }>('/editor', { method: 'POST' })
    const rejection = expect(request).rejects.toThrow('FAQ editor request timed out.')

    await vi.advanceTimersByTimeAsync(MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS)
    await rejection

    const [, init] = fetchMock.mock.calls[0] ?? []
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect((init?.signal as AbortSignal).aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
})
