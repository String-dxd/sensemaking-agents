import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { type ReactNode, useEffect } from 'react'
import { DevPalette } from '~/components/DevPalette'
import { HatchTuneHud } from '~/components/student-space/onboarding/HatchTuneHud'
import { queryClient } from '~/router'
import styles from '~/styles.css?url'

export interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'SenseMake' },
      {
        name: 'description',
        content: 'Mirror, Connector, Cartographer — a per-student library of reflections.',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      },
      { rel: 'stylesheet', href: styles },
    ],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
})

// Chunk-load failures happen when the browser's cached module URL no longer
// matches what the server is willing to serve. In production this is the
// classic post-deploy stale-tab case; in dev it appears after Vite restarts
// or HMR invalidates a route file the tab still references. The user-visible
// recovery in both cases is a hard reload, so do that automatically instead
// of stranding them on the "Something went wrong" overlay.
const CHUNK_LOAD_ERROR_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
]

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => message.includes(pattern))
}

function RootErrorComponent({ error }: { error: Error }) {
  const chunkFailure = isChunkLoadError(error)

  useEffect(() => {
    if (chunkFailure && typeof window !== 'undefined') {
      window.location.reload()
    }
  }, [chunkFailure])

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-xl flex-col items-start justify-center gap-3 px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-[color:rgba(43,38,32,0.7)]">
        {chunkFailure ? 'Reloading…' : (error.message ?? 'Unknown error.')}
      </p>
    </div>
  )
}

function RootComponent() {
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        {/* The engine + sidebar shell lives in `_app` (see `src/routes/_app.tsx`)
            so it only mounts for student-space routes. Dev tooling routes
            (`/dev/*`) nest under `_dev` and skip the engine entirely. The
            public share page (`/share/$token`) and API routes opt out of
            both layouts by sitting at the top level. */}
        <Outlet />
        <DevPalette />
        <HatchTuneHud />
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
