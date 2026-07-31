// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSameOriginRequest } from '~/auth/same-origin'

const submitRecord = vi.fn()
const deleteRecord = vi.fn()
const listFeedback = vi.fn()
const listPublicFeedback = vi.fn()
const checkSession = vi.fn()

vi.mock('@tanstack/react-start/server', () => ({
  setResponseHeader: vi.fn(),
}))

vi.mock('~/server/my-world-faq-feedback-repository.server', () => ({
  submitMyWorldFaqFeedbackRecord: submitRecord,
  deleteMyWorldFaqFeedbackRecord: deleteRecord,
  listMyWorldFaqFeedback: listFeedback,
  listPublicMyWorldFaqFeedback: listPublicFeedback,
}))

vi.mock('~/server/my-world-faq-editor.handler.server', () => ({
  checkMyWorldFaqEditorSessionHandler: checkSession,
}))

const {
  deleteMyWorldFaqFeedbackHandler,
  loadMyWorldFaqFeedbackInboxHandler,
  loadMyWorldFaqPublicFeedbackHandler,
  submitMyWorldFaqFeedbackHandler,
} = await import('~/server/my-world-faq-feedback.handler.server')

function request(origin = 'http://127.0.0.1:3001') {
  return new Request(`${origin}/_server/feedback`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Sec-Fetch-Site': 'same-origin',
    },
  })
}

describe('My World FAQ feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stores a same-origin submission without identity fields', async () => {
    const item = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'concern',
      message: 'Please explain the quiet-hours boundary.',
      createdAt: '2026-07-31T03:00:00.000Z',
    }
    const deleteToken = 'a'.repeat(43)
    submitRecord.mockResolvedValue({ accepted: true, item, deleteToken })
    const sameOriginRequest = request()
    expect(isSameOriginRequest(sameOriginRequest)).toBe(true)

    await expect(
      submitMyWorldFaqFeedbackHandler(sameOriginRequest, {
        kind: 'concern',
        message: 'Please explain the quiet-hours boundary.',
      }),
    ).resolves.toEqual({ ok: true, item, deleteToken })
    expect(submitRecord).toHaveBeenCalledWith({
      kind: 'concern',
      message: 'Please explain the quiet-hours boundary.',
    })
  })

  it('publishes recent feedback and lets only the removal-key holder delete it', async () => {
    const item = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'compliment',
      message: 'Keep the clear evidence labels.',
      createdAt: '2026-07-31T03:00:00.000Z',
    }
    listPublicFeedback.mockResolvedValue([item])

    await expect(loadMyWorldFaqPublicFeedbackHandler()).resolves.toEqual({
      status: 'ready',
      items: [item],
    })

    deleteRecord.mockResolvedValueOnce(false)
    await expect(
      deleteMyWorldFaqFeedbackHandler(request(), {
        id: item.id,
        deleteToken: 'x'.repeat(43),
      }),
    ).resolves.toMatchObject({ ok: false, error: 'not_found' })

    deleteRecord.mockResolvedValueOnce(true)
    await expect(
      deleteMyWorldFaqFeedbackHandler(request(), {
        id: item.id,
        deleteToken: 'a'.repeat(43),
      }),
    ).resolves.toEqual({ ok: true })
  })

  it('rejects cross-origin submissions before persistence', async () => {
    const crossOrigin = new Request('https://faq.example/_server/feedback', {
      method: 'POST',
      headers: { Origin: 'https://other.example' },
    })

    await expect(
      submitMyWorldFaqFeedbackHandler(crossOrigin, {
        kind: 'question',
        message: 'Should not be saved.',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'invalid' })
    expect(submitRecord).not.toHaveBeenCalled()
  })

  it('returns a clear busy state at the global ceiling', async () => {
    submitRecord.mockResolvedValue({ accepted: false, reason: 'rate_limited' })

    await expect(
      submitMyWorldFaqFeedbackHandler(request(), {
        kind: 'suggestion',
        message: 'Try again later.',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'rate_limited' })
  })

  it('reveals the inbox only after the editor session is ready', async () => {
    checkSession.mockResolvedValueOnce({ status: 'locked' })
    await expect(loadMyWorldFaqFeedbackInboxHandler(request())).resolves.toEqual({
      status: 'locked',
    })
    expect(listFeedback).not.toHaveBeenCalled()

    const item = {
      id: '11111111-1111-4111-8111-111111111111',
      kind: 'question',
      message: 'What changed?',
      createdAt: '2026-07-31T03:00:00.000Z',
    }
    checkSession.mockResolvedValueOnce({
      status: 'ready',
      identity: {
        displayName: 'Editor',
        idleExpiresAt: '2026-07-31T04:00:00.000Z',
        absoluteExpiresAt: '2026-08-01T03:00:00.000Z',
      },
    })
    listFeedback.mockResolvedValue([item])

    await expect(loadMyWorldFaqFeedbackInboxHandler(request())).resolves.toEqual({
      status: 'ready',
      items: [item],
    })
  })
})
