// WorkOS AuthKit configuration shim. The actual middleware + server
// functions (`authkitMiddleware`, `getAuth`, `handleCallbackRoute`,
// `getSignInUrl`, `signOut`) are re-exported by
// `@workos/authkit-tanstack-react-start`; this file owns:
//
//   - env-var validation (one place, called from `src/start.ts` and the
//     `/api/auth/*` route handlers)
//   - the Google-only social-provider posture for v0.2 (configured in the
//     WorkOS dashboard, not in code — Google is the lone provider behind a
//     single "Sign in with Google" button, per plan §6.1).
//
// Open Google sign-up is acceptable for the local v0.2 demo, but real
// WorkOS users resolve to private empty student namespaces. Seeded demo data
// is available only through the explicit demo account/dev-bypass paths.
// Production hardening (organization invite / `hd` claim validation / email
// allowlist) is deferred to a follow-up PR.

const REQUIRED_VARS = [
  'WORKOS_CLIENT_ID',
  'WORKOS_API_KEY',
  'WORKOS_REDIRECT_URI',
  'WORKOS_COOKIE_PASSWORD',
] as const

export type RequiredWorkosVar = (typeof REQUIRED_VARS)[number]

export class WorkOSEnvError extends Error {
  readonly missing: readonly RequiredWorkosVar[]
  readonly invalid: readonly string[]
  constructor(missing: readonly RequiredWorkosVar[], invalid: readonly string[] = []) {
    super(
      workosEnvErrorMessage(missing, invalid) +
        'See plan §10 for the full list. For demos, use the demo account flow or set ' +
        'DEV_BYPASS_AUTH=demo-a in .env to skip auth during local development.',
    )
    this.name = 'WorkOSEnvError'
    this.missing = missing
    this.invalid = invalid
  }
}

/**
 * Validate every required WorkOS env var is set. Throws `WorkOSEnvError`
 * if any are missing. Called from `src/start.ts` before registering
 * `authkitMiddleware()` and from the `/api/auth/*` route handlers
 * defensively.
 */
export function assertWorkosEnv(): void {
  const missing = REQUIRED_VARS.filter((k) => {
    const v = process.env[k]
    return typeof v !== 'string' || v.trim().length === 0
  })
  const invalid = validateWorkosEnvValues()
  if (missing.length > 0 || invalid.length > 0) throw new WorkOSEnvError(missing, invalid)
}

export function hasWorkosEnv(): boolean {
  try {
    assertWorkosEnv()
    return true
  } catch {
    return false
  }
}

function validateWorkosEnvValues(): string[] {
  const invalid: string[] = []
  const cookiePassword = process.env.WORKOS_COOKIE_PASSWORD
  if (cookiePassword && cookiePassword.trim().length > 0 && cookiePassword.length < 32) {
    invalid.push('WORKOS_COOKIE_PASSWORD must be at least 32 characters')
  }

  const redirectUri = process.env.WORKOS_REDIRECT_URI
  if (redirectUri && redirectUri.trim().length > 0) {
    try {
      const parsed = new URL(redirectUri)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        invalid.push('WORKOS_REDIRECT_URI must be an http(s) URL')
      }
    } catch {
      invalid.push('WORKOS_REDIRECT_URI must be a valid URL')
    }
  }
  return invalid
}

function workosEnvErrorMessage(
  missing: readonly RequiredWorkosVar[],
  invalid: readonly string[],
): string {
  const parts: string[] = []
  if (missing.length > 0) parts.push(`WorkOS env vars missing: ${missing.join(', ')}.`)
  if (invalid.length > 0) parts.push(`WorkOS env vars invalid: ${invalid.join('; ')}.`)
  return `${parts.join(' ')} `
}
