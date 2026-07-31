import { createServerFn } from '@tanstack/react-start'
import type {
  MyWorldFaqFeedbackItem,
  MyWorldFaqFeedbackKind,
} from './my-world-faq-feedback-repository.server'

export interface SubmitMyWorldFaqFeedbackInput {
  kind: MyWorldFaqFeedbackKind
  message: string
}

export type SubmitMyWorldFaqFeedbackResponse =
  | { ok: true; item: MyWorldFaqFeedbackItem; deleteToken: string }
  | { ok: false; error: 'invalid' | 'rate_limited' | 'unavailable'; message: string }

export interface DeleteMyWorldFaqFeedbackInput {
  id: string
  deleteToken: string
}

export type DeleteMyWorldFaqFeedbackResponse =
  | { ok: true }
  | { ok: false; error: 'invalid' | 'not_found' | 'unavailable'; message: string }

export type MyWorldFaqPublicFeedbackResponse =
  | { status: 'ready'; items: MyWorldFaqFeedbackItem[] }
  | { status: 'unavailable'; items: [] }

export type MyWorldFaqFeedbackInboxResponse =
  | { status: 'ready'; items: MyWorldFaqFeedbackItem[] }
  | { status: 'locked' | 'unavailable' }

export const loadMyWorldFaqFeedbackAvailability = createServerFn({ method: 'GET' }).handler(
  async (): Promise<boolean> => {
    const { isMyWorldFaqFeedbackAvailable } = await import(
      './my-world-faq-feedback-repository.server'
    )
    return isMyWorldFaqFeedbackAvailable()
  },
)

export const submitMyWorldFaqFeedback = createServerFn({ method: 'POST' })
  .inputValidator(parseFeedbackInput)
  .handler(async ({ data }): Promise<SubmitMyWorldFaqFeedbackResponse> => {
    const [{ getRequest }, { submitMyWorldFaqFeedbackHandler }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./my-world-faq-feedback.handler.server'),
    ])
    return submitMyWorldFaqFeedbackHandler(getRequest(), data)
  })

export const deleteMyWorldFaqFeedback = createServerFn({ method: 'POST' })
  .inputValidator(parseDeleteFeedbackInput)
  .handler(async ({ data }): Promise<DeleteMyWorldFaqFeedbackResponse> => {
    const [{ getRequest }, { deleteMyWorldFaqFeedbackHandler }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./my-world-faq-feedback.handler.server'),
    ])
    return deleteMyWorldFaqFeedbackHandler(getRequest(), data)
  })

export const loadMyWorldFaqPublicFeedback = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MyWorldFaqPublicFeedbackResponse> => {
    const { loadMyWorldFaqPublicFeedbackHandler } = await import(
      './my-world-faq-feedback.handler.server'
    )
    return loadMyWorldFaqPublicFeedbackHandler()
  },
)

export const loadMyWorldFaqFeedbackInbox = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MyWorldFaqFeedbackInboxResponse> => {
    const [{ getRequest }, { loadMyWorldFaqFeedbackInboxHandler }] = await Promise.all([
      import('@tanstack/react-start/server'),
      import('./my-world-faq-feedback.handler.server'),
    ])
    return loadMyWorldFaqFeedbackInboxHandler(getRequest())
  },
)

function parseFeedbackInput(raw: unknown): SubmitMyWorldFaqFeedbackInput {
  if (!isPlainRecord(raw) || Object.keys(raw).sort().join(',') !== 'kind,message') {
    throw new Error('Invalid feedback.')
  }
  if (
    raw.kind !== 'question' &&
    raw.kind !== 'concern' &&
    raw.kind !== 'suggestion' &&
    raw.kind !== 'compliment'
  ) {
    throw new Error('Choose a feedback type.')
  }
  if (typeof raw.message !== 'string') throw new Error('Enter your feedback.')
  const message = raw.message.trim()
  if (message.length < 1 || message.length > 2000) {
    throw new Error('Feedback must be between 1 and 2,000 characters.')
  }
  return { kind: raw.kind, message }
}

function parseDeleteFeedbackInput(raw: unknown): DeleteMyWorldFaqFeedbackInput {
  if (!isPlainRecord(raw) || Object.keys(raw).sort().join(',') !== 'deleteToken,id') {
    throw new Error('Invalid removal request.')
  }
  if (
    typeof raw.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)
  ) {
    throw new Error('Invalid feedback identifier.')
  }
  if (typeof raw.deleteToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw.deleteToken)) {
    throw new Error('Invalid removal key.')
  }
  return { id: raw.id, deleteToken: raw.deleteToken }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
