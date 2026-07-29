import { describe, expect, it } from 'vitest'
import {
  MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES,
  serializeMyWorldFaqEditorPublishRequest,
} from '~/server/my-world-faq-editor.functions'
import { buildValidPublishRequestAtByteLength } from '../data/my-world-faq-publish-envelope.fixture'

describe('My World FAQ publish envelope serialization', () => {
  it.each([
    { offset: 0, exceedsLimit: false },
    { offset: 1, exceedsLimit: true },
  ])('measures the exact UTF-8 body at limit + $offset bytes', ({ offset, exceedsLimit }) => {
    const expectedBytes = MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES + offset
    const request = buildValidPublishRequestAtByteLength(expectedBytes)

    const serialized = serializeMyWorldFaqEditorPublishRequest(request)

    expect(serialized.body).toBe(JSON.stringify(request))
    expect(serialized.body).toContain('界')
    expect(Buffer.byteLength(serialized.body, 'utf8')).toBe(expectedBytes)
    expect(serialized.byteLength).toBe(expectedBytes)
    expect(serialized.exceedsLimit).toBe(exceedsLimit)
  })
})
