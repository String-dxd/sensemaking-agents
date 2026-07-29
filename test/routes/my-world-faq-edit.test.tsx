import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FaqEditorGate } from '~/components/my-world-faq/editor/FaqEditorGate'
import { loadMyWorldFaqEditRouteData, Route } from '~/routes/my-world.faq_.edit'

const loadMyWorldFaqEditorMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/my-world-faq-editor.functions', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/server/my-world-faq-editor.functions')>()
  return {
    ...original,
    loadMyWorldFaqEditor: loadMyWorldFaqEditorMock,
  }
})

describe('/my-world/faq/edit protected route', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    loadMyWorldFaqEditorMock.mockReset()
  })

  it('returns only the locked state before authentication', async () => {
    loadMyWorldFaqEditorMock.mockResolvedValue({ status: 'locked' })

    const result = await loadMyWorldFaqEditRouteData()

    expect(result).toEqual({ status: 'locked' })
    expect(result).not.toHaveProperty('base')
    expect(result).not.toHaveProperty('manifest')
    expect(result).not.toHaveProperty('history')
  })

  it('fails closed without exposing loader errors', async () => {
    loadMyWorldFaqEditorMock.mockRejectedValue(
      new Error('DATABASE_URL=postgres://private-host/private'),
    )

    await expect(loadMyWorldFaqEditRouteData()).resolves.toEqual({
      status: 'unavailable',
    })
  })

  it('marks every editor response private and unindexable', async () => {
    const headers = (Route.options.headers as () => Record<string, string>)()
    const head = await Route.options.head?.({} as never)

    expect(headers).toMatchObject({
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      Vary: 'Cookie',
    })
    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex, nofollow' })
    expect(head?.meta).toContainEqual({ name: 'referrer', content: 'no-referrer' })
  })

  it('unlocks with the shared password and self-declared name', async () => {
    const user = userEvent.setup()
    const onUnlocked = vi.fn()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ ok: true, displayName: 'Ari' }))
    render(<FaqEditorGate onUnlocked={onUnlocked} />)

    expect(screen.queryByText(/supporting records/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Display name'), 'Ari')
    await user.type(screen.getByLabelText('Shared password'), 'team password')
    await user.click(screen.getByRole('button', { name: 'Unlock editor' }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/my-world/faq/editor/session',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
      }),
    )
    expect(onUnlocked).toHaveBeenCalledTimes(1)
  })

  it('releases the unlock form after the request deadline', async () => {
    vi.useFakeTimers()
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined))
    const onUnlocked = vi.fn()
    render(<FaqEditorGate onUnlocked={onUnlocked} />)

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ari' } })
    fireEvent.change(screen.getByLabelText('Shared password'), {
      target: { value: 'team password' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unlock editor' }))
    expect(screen.getByRole('button', { name: 'Unlocking…' })).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001)
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The editor could not be unlocked. Check your connection and try again.',
    )
    expect(screen.getByRole('button', { name: 'Unlock editor' })).toBeEnabled()
    expect(screen.getByLabelText('Shared password')).toHaveValue('team password')
    expect(onUnlocked).not.toHaveBeenCalled()
  })
})
