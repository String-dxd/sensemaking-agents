import { describe, expect, it, vi } from 'vitest'
import {
  BodyEnvelopeError,
  getEditorBodyPolicy,
  readBodyWithinLimit,
  validateBodyEnvelope,
} from '../../api/request-body-limits'

describe('FAQ editor request-body limits', () => {
  it('declares exact POST-only policies without changing unrelated APIs', () => {
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/session', 'POST')).toMatchObject({
      maxBytes: 4_096,
    })
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/logout', 'POST')).toMatchObject({
      maxBytes: 1_024,
    })
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/restore', 'POST')).toMatchObject({
      maxBytes: 8_192,
    })
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/publish', 'POST')).toMatchObject({
      maxBytes: 1_048_576,
    })
    expect(getEditorBodyPolicy('/api/my-world/faq/editor/session', 'GET')).toBeNull()
    expect(getEditorBodyPolicy('/api/openai/realtime-mirror', 'POST')).toBeNull()
  })

  it('requires JSON and rejects malformed or oversized declared lengths', () => {
    const policy = getEditorBodyPolicy('/api/my-world/faq/editor/session', 'POST')
    if (!policy) throw new Error('Expected body policy')

    expect(() =>
      validateBodyEnvelope({ 'content-type': 'application/json; charset=utf-8' }, policy),
    ).not.toThrow()
    expect(() => validateBodyEnvelope({ 'content-type': 'text/plain' }, policy)).toThrowError(
      expect.objectContaining({ status: 415 }),
    )
    expect(() =>
      validateBodyEnvelope(
        { 'content-type': 'application/json', 'content-length': 'not-a-number' },
        policy,
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }))
    expect(() =>
      validateBodyEnvelope(
        { 'content-type': 'application/json', 'content-length': '4097' },
        policy,
      ),
    ).toThrowError(expect.objectContaining({ status: 413 }))
  })

  it('accepts the exact streamed limit and rejects one byte beyond it', async () => {
    async function* exact() {
      yield Buffer.alloc(2)
      yield Buffer.alloc(2)
    }
    async function* oversized() {
      yield Buffer.alloc(4)
      yield Buffer.alloc(1)
    }

    await expect(readBodyWithinLimit(exact(), 4)).resolves.toHaveLength(4)
    await expect(readBodyWithinLimit(oversized(), 4)).rejects.toBeInstanceOf(BodyEnvelopeError)
  })

  it('rejects declared oversize before consuming the stream', async () => {
    const iterator = vi.fn()
    const source = { [Symbol.asyncIterator]: iterator }
    const policy = getEditorBodyPolicy('/api/my-world/faq/editor/session', 'POST')
    if (!policy) throw new Error('Expected body policy')

    expect(() =>
      validateBodyEnvelope(
        { 'content-type': 'application/json', 'content-length': '5000' },
        policy,
      ),
    ).toThrow()
    expect(iterator).not.toHaveBeenCalled()
    expect(source).toBeDefined()
  })
})
