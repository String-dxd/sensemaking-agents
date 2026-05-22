import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { DevPalette } from '~/components/DevPalette'
import { EngineHost } from '~/components/student-space/EngineHost'
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
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        {/* EngineHost mounts once at the layout level so its WebGL context and
            in-memory state survive route changes. It owns the `.game` canvas
            (position: fixed, anchored to the viewport) and exposes the live
            Game instance to every descendant via EngineContext. Routed pages
            drive the overlay via URL; non-routed surfaces (capture sheets,
            HUDs, in-world labels) mount inside the `/` route's component. */}
        <EngineHost>
          <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
            <main className="flex min-h-0 w-full flex-1 flex-col">
              <Outlet />
            </main>
          </div>
        </EngineHost>
        {/* Cmd-K palette. On in dev by default; in production builds it is
            included only when `VITE_ENABLE_DEV_PALETTE=1` is set at build
            time. Vercel staging sets the flag so QA can reach `/dev/pipeline`
            and the other developer commands. */}
        {import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_PALETTE === '1' ? (
          <DevPalette />
        ) : null}
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
