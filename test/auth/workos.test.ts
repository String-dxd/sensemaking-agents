import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertWorkosEnv, hasWorkosEnv, WorkOSEnvError } from '~/auth/workos'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.WORKOS_CLIENT_ID = 'client_123'
  process.env.WORKOS_API_KEY = 'sk_test_123'
  process.env.WORKOS_REDIRECT_URI = 'http://localhost:3000/api/auth/callback'
  process.env.WORKOS_COOKIE_PASSWORD = 'x'.repeat(32)
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('WorkOS env validation', () => {
  it('accepts a complete valid local configuration', () => {
    expect(() => assertWorkosEnv()).not.toThrow()
    expect(hasWorkosEnv()).toBe(true)
  })

  it('rejects too-short cookie passwords before middleware registration', () => {
    process.env.WORKOS_COOKIE_PASSWORD = 'short'

    expect(() => assertWorkosEnv()).toThrow(WorkOSEnvError)
    expect(hasWorkosEnv()).toBe(false)
  })

  it('rejects malformed redirect URIs before middleware registration', () => {
    process.env.WORKOS_REDIRECT_URI = 'not a url'

    expect(() => assertWorkosEnv()).toThrow(WorkOSEnvError)
    expect(hasWorkosEnv()).toBe(false)
  })
})
