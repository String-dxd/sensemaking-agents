// WorkOS AuthKit OAuth callback. On the first successful sign-in for a
// counselor we idempotently attach them to the 4 demo students; on every
// subsequent sign-in the attach is a no-op (`on conflict do nothing` per
// `attachCounselorToDemoStudents`).
//
// The callback URL is `WORKOS_REDIRECT_URI` in env. The WorkOS dashboard
// must list this exact URL under "Redirect URIs".

import { createFileRoute } from '@tanstack/react-router'
import { handleCallbackRoute } from '@workos/authkit-tanstack-react-start'

import { bootstrapDemoStudentsForCounselor } from '~/auth/middleware'

export const Route = createFileRoute('/api/auth/callback')({
  server: {
    handlers: {
      GET: handleCallbackRoute({
        onSuccess: async ({ user }) => {
          await bootstrapDemoStudentsForCounselor(user.id)
        },
        // On callback failure WorkOS already logs to console; the user
        // lands on `/sign-in?error=auth_failed` so the verifier cookies
        // are still cleared.
        errorRedirectUrl: '/sign-in?error=auth_failed',
      }),
    },
  },
})
