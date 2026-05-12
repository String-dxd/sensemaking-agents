// Sign-out route. AuthKit's `signOut()` clears the session cookie and
// redirects to WorkOS's logout URL, which then bounces back to '/'.

import { createFileRoute } from '@tanstack/react-router'
import { signOut } from '@workos/authkit-tanstack-react-start'

export const Route = createFileRoute('/api/auth/sign-out')({
  loader: async () => {
    await signOut()
  },
})
