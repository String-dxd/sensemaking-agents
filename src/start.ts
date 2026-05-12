// TanStack Start entry: registers the WorkOS AuthKit request middleware.
//
// Conditional registration — the middleware crashes every request when its
// env vars are missing (see `WorkOSEnvError`). For Steps 5-10 of the
// migration we need `pnpm dev` to keep working without a populated WorkOS
// dashboard, so we skip registration when `DEV_BYPASS_AUTH` is set or when
// the WorkOS env vars are absent. `src/auth/identity.ts` handles the
// equivalent identity resolution under those modes.
//
// Production Vercel sets the WorkOS env vars and never sets
// `DEV_BYPASS_AUTH`, so this falls through to the real middleware path
// there.

import { createStart } from '@tanstack/react-start'
import { authkitMiddleware } from '@workos/authkit-tanstack-react-start'

import { isAuthBypassed } from '~/auth/middleware'
import { hasWorkosEnv } from '~/auth/workos'

export const startInstance = createStart(() => {
  if (isAuthBypassed()) return {}
  if (!hasWorkosEnv()) return {}
  return {
    requestMiddleware: [authkitMiddleware()],
  }
})
