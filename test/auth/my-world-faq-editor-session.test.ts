// @vitest-environment node

import { randomUUID } from 'node:crypto'
import { argon2id, hash } from 'argon2'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearMyWorldFaqEditorCookieHeader,
  createMyWorldFaqEditorSessionService,
  credentialFingerprintForMyWorldFaq,
  MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT,
  MY_WORLD_FAQ_EDITOR_COOKIE_PRODUCTION,
  MyWorldFaqEditorAuthError,
  myWorldFaqEditorCookieHeader,
  normalizeMyWorldFaqEditorDisplayName,
  parseMyWorldFaqEditorEnabled,
  tokenDigestForMyWorldFaq,
  validateMyWorldFaqArgon2Hash,
} from '~/auth/my-world-faq-editor-session.server'
import type {
  CreateMyWorldFaqEditorSessionInput,
  MyWorldFaqEditorSessionRow,
} from '~/server/my-world-faq-repository.server'

const VALID_HASH = '$argon2id$v=19$m=19456,p=1,t=2$c2FsdA$aGFzaA'

function sessionRow(input: CreateMyWorldFaqEditorSessionInput): MyWorldFaqEditorSessionRow {
  const now = new Date('2026-07-29T10:00:00.000Z').toISOString()
  return {
    tokenDigest: input.tokenDigest,
    auditId: input.auditId,
    displayName: input.displayName,
    credentialFingerprint: input.credentialFingerprint,
    createdAt: now,
    lastSeenAt: now,
    absoluteExpiresAt: input.absoluteExpiresAt.toISOString(),
    revokedAt: null,
    mutationWindowStartedAt: now,
    mutationCount: 0,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('My World FAQ editor session boundary', () => {
  it('enables only the exact literal true and validates the Argon2id floor', () => {
    expect(parseMyWorldFaqEditorEnabled(undefined)).toBe(false)
    expect(parseMyWorldFaqEditorEnabled('false')).toBe(false)
    expect(parseMyWorldFaqEditorEnabled('TRUE')).toBe(false)
    expect(parseMyWorldFaqEditorEnabled('true')).toBe(true)

    expect(validateMyWorldFaqArgon2Hash(VALID_HASH)).toBe(true)
    expect(validateMyWorldFaqArgon2Hash('$argon2id$v=19$m=4096,p=1,t=2$c2FsdA$aGFzaA')).toBe(false)
    expect(validateMyWorldFaqArgon2Hash('$argon2i$v=19$m=19456,p=1,t=2$c2FsdA$aGFzaA')).toBe(false)
    expect(validateMyWorldFaqArgon2Hash('$argon2id$v=19$m=19456,p=2,t=2$c2FsdA$aGFzaA')).toBe(false)
  })

  it('normalizes display names without accepting controls or oversized names', () => {
    expect(normalizeMyWorldFaqEditorDisplayName('  Jose\u0301  ')).toBe('José')
    expect(() => normalizeMyWorldFaqEditorDisplayName('')).toThrowError(
      expect.objectContaining({ code: 'INVALID_DISPLAY_NAME' }),
    )
    expect(() => normalizeMyWorldFaqEditorDisplayName('A\u0000B')).toThrow()
    expect(() => normalizeMyWorldFaqEditorDisplayName('a'.repeat(81))).toThrow()
  })

  it('rejects an oversized password before Argon2 or persistence work', async () => {
    vi.stubEnv('MY_WORLD_FAQ_EDITOR_PASSWORD_HASH', VALID_HASH)
    const verifyHash = vi.fn()
    const createSession = vi.fn()
    const service = createMyWorldFaqEditorSessionService({
      verifyHash,
      createSession,
    })

    await expect(
      service.unlock({ password: '🦜'.repeat(65), displayName: 'FAQ Teammate' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
    expect(verifyHash).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('stores only the token digest and resolves rotation-bound sessions', async () => {
    vi.stubEnv('MY_WORLD_FAQ_EDITOR_PASSWORD_HASH', VALID_HASH)
    const createSession = vi.fn(async (input: CreateMyWorldFaqEditorSessionInput) =>
      sessionRow(input),
    )
    const resolveSession = vi.fn(async () => null)
    const service = createMyWorldFaqEditorSessionService({
      verifyHash: vi.fn(async () => true),
      createSession,
      resolveSession,
      pruneSessions: vi.fn(async () => 0),
      now: () => new Date('2026-07-29T10:00:00.000Z'),
      randomToken: () => Buffer.alloc(32, 7),
      randomAuditId: () => '52191ce5-a0b2-4b9c-a278-ecbad1eaef43',
    })

    const unlocked = await service.unlock({
      password: 'a strong password-manager secret',
      displayName: '  FAQ Teammate  ',
    })
    const persisted = createSession.mock.calls[0]?.[0]

    expect(unlocked.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(persisted?.tokenDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(persisted?.tokenDigest).not.toContain(unlocked.rawToken)
    expect(persisted?.displayName).toBe('FAQ Teammate')
    expect(persisted?.credentialFingerprint).toBe(credentialFingerprintForMyWorldFaq(VALID_HASH))

    const request = new Request('http://localhost/my-world/faq/edit', {
      headers: {
        Cookie: `${MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT}=${unlocked.rawToken}`,
      },
    })
    await expect(service.requireSession(request)).rejects.toBeInstanceOf(MyWorldFaqEditorAuthError)
    expect(resolveSession).toHaveBeenCalledWith(
      tokenDigestForMyWorldFaq(unlocked.rawToken),
      credentialFingerprintForMyWorldFaq(VALID_HASH),
    )
  })

  it('verifies a real Argon2id PHC string at the required floor', async () => {
    const password = 'a generated local test password'
    const encoded = await hash(password, {
      type: argon2id,
      memoryCost: 19 * 1_024,
      timeCost: 2,
      parallelism: 1,
    })
    vi.stubEnv('MY_WORLD_FAQ_EDITOR_PASSWORD_HASH', encoded)
    const service = createMyWorldFaqEditorSessionService({
      createSession: async (input) => sessionRow(input),
      pruneSessions: async () => 0,
      randomToken: () => Buffer.alloc(32, 9),
    })

    await expect(service.unlock({ password, displayName: 'FAQ Teammate' })).resolves.toMatchObject({
      identity: { displayName: 'FAQ Teammate' },
    })
  })

  it('assembles distinct secure production and explicit HTTP development cookies', () => {
    const expiry = new Date(Date.now() + 60_000)
    const production = myWorldFaqEditorCookieHeader(
      'token',
      expiry,
      'https://faq.example/my-world/faq/edit',
    )
    const development = myWorldFaqEditorCookieHeader(
      'token',
      expiry,
      'http://localhost:3001/my-world/faq/edit',
    )

    expect(production).toContain(`${MY_WORLD_FAQ_EDITOR_COOKIE_PRODUCTION}=token`)
    expect(production).toContain('Secure')
    expect(production).toContain('HttpOnly')
    expect(production).toContain('SameSite=Lax')
    expect(development).toContain(`${MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT}=token`)
    expect(development).not.toContain('Secure')
    expect(clearMyWorldFaqEditorCookieHeader('https://faq.example/')).toContain('Max-Age=0')
  })

  it('uses independent audit IDs rather than token-derived identifiers', () => {
    const first = randomUUID()
    const second = randomUUID()
    expect(first).not.toBe(second)
    expect(tokenDigestForMyWorldFaq('token')).toMatch(/^[a-f0-9]{64}$/)
  })
})
