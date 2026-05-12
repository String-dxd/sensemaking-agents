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
// Per the plan §6.1, open Google sign-up is acceptable for the v0.2 demo
// (any Google-authenticated user becomes a counselor with access to the
// 4 demo students). Production hardening (organization invite / `hd` claim
// validation / email allowlist) is deferred to a follow-up PR — see
// plan §16 "P1 items resolved during 2026-05-12 walkthrough".

const REQUIRED_VARS = [
  'WORKOS_CLIENT_ID',
  'WORKOS_API_KEY',
  'WORKOS_REDIRECT_URI',
  'WORKOS_COOKIE_PASSWORD',
] as const

export type RequiredWorkosVar = (typeof REQUIRED_VARS)[number]

export class WorkOSEnvError extends Error {
  readonly missing: readonly RequiredWorkosVar[]
  constructor(missing: readonly RequiredWorkosVar[]) {
    super(
      `WorkOS env vars missing: ${missing.join(', ')}. ` +
        'See plan §10 for the full list, or set DEV_BYPASS_AUTH=demo-a in .env.local ' +
        'to skip auth entirely during local development.',
    )
    this.name = 'WorkOSEnvError'
    this.missing = missing
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
  if (missing.length > 0) throw new WorkOSEnvError(missing)
}

export function hasWorkosEnv(): boolean {
  try {
    assertWorkosEnv()
    return true
  } catch {
    return false
  }
}
