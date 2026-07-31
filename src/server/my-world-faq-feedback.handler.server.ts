import { setResponseHeader } from '@tanstack/react-start/server'
import { isSameOriginRequest } from '~/auth/same-origin'
import { checkMyWorldFaqEditorSessionHandler } from './my-world-faq-editor.handler.server'
import type {
  DeleteMyWorldFaqFeedbackInput,
  DeleteMyWorldFaqFeedbackResponse,
  MyWorldFaqFeedbackInboxResponse,
  MyWorldFaqPublicFeedbackResponse,
  SubmitMyWorldFaqFeedbackInput,
  SubmitMyWorldFaqFeedbackResponse,
} from './my-world-faq-feedback.functions'
import {
  deleteMyWorldFaqFeedbackRecord,
  listMyWorldFaqFeedback,
  listPublicMyWorldFaqFeedback,
  submitMyWorldFaqFeedbackRecord,
} from './my-world-faq-feedback-repository.server'

export async function submitMyWorldFaqFeedbackHandler(
  request: Request,
  input: SubmitMyWorldFaqFeedbackInput,
): Promise<SubmitMyWorldFaqFeedbackResponse> {
  setNoStoreHeaders()
  if (!isAllowedFeedbackTransport(request) || !isSameOriginRequest(request)) {
    return { ok: false, error: 'invalid', message: 'The feedback request is not valid.' }
  }

  try {
    const result = await submitMyWorldFaqFeedbackRecord(input)
    if (!result.accepted) {
      return {
        ok: false,
        error: 'rate_limited',
        message: 'The inbox is busy. Please wait and try again later.',
      }
    }
    return { ok: true, item: result.item, deleteToken: result.deleteToken }
  } catch {
    return {
      ok: false,
      error: 'unavailable',
      message: 'Your feedback could not be saved right now. Please try again.',
    }
  }
}

export async function deleteMyWorldFaqFeedbackHandler(
  request: Request,
  input: DeleteMyWorldFaqFeedbackInput,
): Promise<DeleteMyWorldFaqFeedbackResponse> {
  setNoStoreHeaders()
  if (!isAllowedFeedbackTransport(request) || !isSameOriginRequest(request)) {
    return { ok: false, error: 'invalid', message: 'The removal request is not valid.' }
  }

  try {
    const deleted = await deleteMyWorldFaqFeedbackRecord(input)
    if (!deleted) {
      return {
        ok: false,
        error: 'not_found',
        message: 'This feedback could not be removed from this browser.',
      }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      error: 'unavailable',
      message: 'Your feedback could not be removed right now. Please try again.',
    }
  }
}

export async function loadMyWorldFaqPublicFeedbackHandler(): Promise<MyWorldFaqPublicFeedbackResponse> {
  setNoStoreHeaders()
  try {
    return { status: 'ready', items: await listPublicMyWorldFaqFeedback() }
  } catch {
    return { status: 'unavailable', items: [] }
  }
}

export async function loadMyWorldFaqFeedbackInboxHandler(
  request: Request,
): Promise<MyWorldFaqFeedbackInboxResponse> {
  setNoStoreHeaders()
  const session = await checkMyWorldFaqEditorSessionHandler(request)
  if (session.status !== 'ready') return session

  try {
    return { status: 'ready', items: await listMyWorldFaqFeedback() }
  } catch {
    return { status: 'unavailable' }
  }
}

function isAllowedFeedbackTransport(request: Request): boolean {
  try {
    const url = new URL(request.url)
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
    return local || url.protocol === 'https:'
  } catch {
    return false
  }
}

function setNoStoreHeaders(): void {
  setResponseHeader('Cache-Control', 'private, no-store')
  setResponseHeader('CDN-Cache-Control', 'no-store')
  setResponseHeader('Vercel-CDN-Cache-Control', 'no-store')
}
