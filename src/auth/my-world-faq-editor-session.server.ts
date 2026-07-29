import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { verify as verifyArgon2 } from 'argon2'
import {
  type CreateMyWorldFaqEditorSessionInput,
  createMyWorldFaqEditorSession,
  type MyWorldFaqEditorSessionRow,
  pruneMyWorldFaqEditorSessions,
  resolveAndTouchMyWorldFaqEditorSession,
  revokeMyWorldFaqEditorSession,
} from '~/server/my-world-faq-repository.server'
import {
  isPlainHttpLocalDevelopment,
  myWorldFaqEditorCookieName,
} from './my-world-faq-editor-cookie'

export {
  clearMyWorldFaqEditorCookieHeader,
  MY_WORLD_FAQ_EDITOR_COOKIE_DEVELOPMENT,
  MY_WORLD_FAQ_EDITOR_COOKIE_PRODUCTION,
} from './my-world-faq-editor-cookie'
export const MY_WORLD_FAQ_EDITOR_IDLE_MS = 30 * 60 * 1_000
export const MY_WORLD_FAQ_EDITOR_ABSOLUTE_MS = 8 * 60 * 60 * 1_000
export const MY_WORLD_FAQ_EDITOR_PASSWORD_MAX_BYTES = 256
export const MY_WORLD_FAQ_ARGON2_MEMORY_FLOOR_KIB = 19 * 1_024
export const MY_WORLD_FAQ_ARGON2_TIME_FLOOR = 2
export const MY_WORLD_FAQ_ARGON2_PARALLELISM = 1

export type MyWorldFaqEditorAuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_DISPLAY_NAME'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'

export class MyWorldFaqEditorAuthError extends Error {
  readonly code: MyWorldFaqEditorAuthErrorCode

  constructor(code: MyWorldFaqEditorAuthErrorCode, options?: { cause?: unknown }) {
    super(
      code === 'INVALID_DISPLAY_NAME'
        ? 'Enter a display name between 1 and 80 characters.'
        : code === 'UNAVAILABLE'
          ? 'The FAQ editor is unavailable.'
          : 'The password or session is not valid.',
      options,
    )
    this.name = 'MyWorldFaqEditorAuthError'
    this.code = code
  }
}

export interface MyWorldFaqEditorSessionIdentity {
  auditId: string
  displayName: string
  idleExpiresAt: string
  absoluteExpiresAt: string
  tokenDigest: string
}

interface SessionDependencies {
  verifyHash(hash: string, password: string): Promise<boolean>
  createSession(input: CreateMyWorldFaqEditorSessionInput): Promise<MyWorldFaqEditorSessionRow>
  resolveSession(
    tokenDigest: string,
    credentialFingerprint: string,
  ): Promise<MyWorldFaqEditorSessionRow | null>
  revokeSession(tokenDigest: string): Promise<boolean>
  pruneSessions(): Promise<number>
  now(): Date
  randomToken(): Buffer
  randomAuditId(): string
}

const defaultDependencies: SessionDependencies = {
  verifyHash: verifyArgon2,
  createSession: createMyWorldFaqEditorSession,
  resolveSession: resolveAndTouchMyWorldFaqEditorSession,
  revokeSession: revokeMyWorldFaqEditorSession,
  pruneSessions: pruneMyWorldFaqEditorSessions,
  now: () => new Date(),
  randomToken: () => randomBytes(32),
  randomAuditId: randomUUID,
}

export function parseMyWorldFaqEditorEnabled(value = process.env.MY_WORLD_FAQ_EDITOR_ENABLED) {
  return value === 'true'
}

export function isMyWorldFaqEditorOperational(
  editorEnabled = process.env.MY_WORLD_FAQ_EDITOR_ENABLED,
  contentSource = process.env.MY_WORLD_FAQ_CONTENT_SOURCE,
): boolean {
  return parseMyWorldFaqEditorEnabled(editorEnabled) && contentSource === 'database'
}

export function assertMyWorldFaqEditorEnabled(): void {
  // Publishing is only truthful when the public FAQ reads the same database
  // head. A flag-only misconfiguration must not accept a save that the public
  // route can never display.
  if (!isMyWorldFaqEditorOperational()) {
    throw new MyWorldFaqEditorAuthError('UNAVAILABLE')
  }
}

export function assertMyWorldFaqEditorRequestTransport(requestUrl: string): void {
  const url = new URL(requestUrl)
  if (url.protocol === 'https:' || isPlainHttpLocalDevelopment(url)) return
  throw new MyWorldFaqEditorAuthError('UNAVAILABLE')
}

export function validateMyWorldFaqArgon2Hash(hash: string): boolean {
  const sections = hash.split('$')
  if (sections.length < 6 || sections[1] !== 'argon2id' || sections[2] !== 'v=19') return false
  const parameters = new Map(
    (sections[3] ?? '').split(',').map((entry) => {
      const [name, value] = entry.split('=', 2)
      return [name, Number(value)] as const
    }),
  )
  return (
    Number.isFinite(parameters.get('m')) &&
    (parameters.get('m') ?? 0) >= MY_WORLD_FAQ_ARGON2_MEMORY_FLOOR_KIB &&
    Number.isFinite(parameters.get('t')) &&
    (parameters.get('t') ?? 0) >= MY_WORLD_FAQ_ARGON2_TIME_FLOOR &&
    parameters.get('p') === MY_WORLD_FAQ_ARGON2_PARALLELISM
  )
}

export function normalizeMyWorldFaqEditorDisplayName(value: string): string {
  const normalized = value.normalize('NFC').trim()
  if ([...normalized].length < 1 || [...normalized].length > 80 || /\p{Cc}/u.test(normalized)) {
    throw new MyWorldFaqEditorAuthError('INVALID_DISPLAY_NAME')
  }
  return normalized
}

export function credentialFingerprintForMyWorldFaq(hash: string): string {
  return sha256(`my-world-faq-editor-credential\0${hash}`)
}

export function tokenDigestForMyWorldFaq(rawToken: string): string {
  return sha256(`my-world-faq-editor-token\0${rawToken}`)
}

export function createMyWorldFaqEditorSessionService(overrides: Partial<SessionDependencies> = {}) {
  const dependencies = { ...defaultDependencies, ...overrides }

  async function unlock(input: { password: string; displayName: string }) {
    const passwordBytes = Buffer.byteLength(input.password, 'utf8')
    if (passwordBytes < 1 || passwordBytes > MY_WORLD_FAQ_EDITOR_PASSWORD_MAX_BYTES) {
      throw new MyWorldFaqEditorAuthError('INVALID_CREDENTIALS')
    }
    const displayName = normalizeMyWorldFaqEditorDisplayName(input.displayName)
    const hash = readConfiguredPasswordHash()

    let matches = false
    try {
      matches = await dependencies.verifyHash(hash, input.password)
    } catch (error) {
      throw new MyWorldFaqEditorAuthError('UNAVAILABLE', { cause: error })
    }
    if (!matches) throw new MyWorldFaqEditorAuthError('INVALID_CREDENTIALS')

    const tokenBytes = dependencies.randomToken()
    if (tokenBytes.byteLength !== 32) {
      throw new MyWorldFaqEditorAuthError('UNAVAILABLE')
    }
    const rawToken = tokenBytes.toString('base64url')
    const tokenDigest = tokenDigestForMyWorldFaq(rawToken)
    const now = dependencies.now()
    const absoluteExpiresAt = new Date(now.valueOf() + MY_WORLD_FAQ_EDITOR_ABSOLUTE_MS)
    let session: MyWorldFaqEditorSessionRow
    try {
      session = await dependencies.createSession({
        tokenDigest,
        auditId: dependencies.randomAuditId(),
        displayName,
        credentialFingerprint: credentialFingerprintForMyWorldFaq(hash),
        absoluteExpiresAt,
      })
      void dependencies.pruneSessions().catch(() => undefined)
    } catch (error) {
      throw new MyWorldFaqEditorAuthError('UNAVAILABLE', { cause: error })
    }
    return {
      identity: identityFromSession(session, tokenDigest),
      rawToken,
      absoluteExpiresAt,
    }
  }

  async function requireSession(request: Request): Promise<MyWorldFaqEditorSessionIdentity> {
    const hash = readConfiguredPasswordHash()
    const rawToken = readMyWorldFaqEditorCookie(request)
    if (!rawToken || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) {
      throw new MyWorldFaqEditorAuthError('UNAUTHORIZED')
    }
    const tokenDigest = tokenDigestForMyWorldFaq(rawToken)
    let session: MyWorldFaqEditorSessionRow | null
    try {
      session = await dependencies.resolveSession(
        tokenDigest,
        credentialFingerprintForMyWorldFaq(hash),
      )
    } catch (error) {
      throw new MyWorldFaqEditorAuthError('UNAVAILABLE', { cause: error })
    }
    if (!session) throw new MyWorldFaqEditorAuthError('UNAUTHORIZED')
    return identityFromSession(session, tokenDigest)
  }

  async function revoke(request: Request): Promise<boolean> {
    const rawToken = readMyWorldFaqEditorCookie(request)
    if (!rawToken || !/^[A-Za-z0-9_-]{43}$/.test(rawToken)) return false
    try {
      return await dependencies.revokeSession(tokenDigestForMyWorldFaq(rawToken))
    } catch (error) {
      throw new MyWorldFaqEditorAuthError('UNAVAILABLE', { cause: error })
    }
  }

  return { requireSession, revoke, unlock }
}

const productionService = createMyWorldFaqEditorSessionService()

export const unlockMyWorldFaqEditor = productionService.unlock
export const requireMyWorldFaqEditorSession = productionService.requireSession
export const revokeMyWorldFaqEditorSessionFromRequest = productionService.revoke

export function myWorldFaqEditorCookieHeader(
  rawToken: string,
  absoluteExpiresAt: Date,
  requestUrl: string,
): string {
  const secure = !isPlainHttpLocalDevelopment(new URL(requestUrl))
  const maxAge = Math.max(
    0,
    Math.min(
      Math.floor((absoluteExpiresAt.valueOf() - Date.now()) / 1_000),
      Math.floor(MY_WORLD_FAQ_EDITOR_ABSOLUTE_MS / 1_000),
    ),
  )
  return [
    `${myWorldFaqEditorCookieName(secure)}=${encodeURIComponent(rawToken)}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ')
}

function readConfiguredPasswordHash(): string {
  const hash = process.env.MY_WORLD_FAQ_EDITOR_PASSWORD_HASH
  if (!hash || !validateMyWorldFaqArgon2Hash(hash)) {
    throw new MyWorldFaqEditorAuthError('UNAVAILABLE')
  }
  return hash
}

function readMyWorldFaqEditorCookie(request: Request): string | null {
  const secure = new URL(request.url).protocol === 'https:'
  const expectedName = myWorldFaqEditorCookieName(secure)
  const cookieHeader = request.headers.get('cookie') ?? ''
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0) continue
    if (pair.slice(0, separator).trim() !== expectedName) continue
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim())
    } catch {
      return null
    }
  }
  return null
}

function identityFromSession(
  session: MyWorldFaqEditorSessionRow,
  tokenDigest: string,
): MyWorldFaqEditorSessionIdentity {
  return {
    auditId: session.auditId,
    displayName: session.displayName,
    idleExpiresAt: new Date(
      new Date(session.lastSeenAt).valueOf() + MY_WORLD_FAQ_EDITOR_IDLE_MS,
    ).toISOString(),
    absoluteExpiresAt: session.absoluteExpiresAt,
    tokenDigest,
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
