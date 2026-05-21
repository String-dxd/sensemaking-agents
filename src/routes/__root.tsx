import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { DevPalette } from '~/components/DevPalette'
import { StudentSpaceHost } from '~/components/StudentSpaceHost'
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
        {/* Engine mounts once at the layout level so its WebGL context and
            in-memory state survive route changes. The `.game` frame is
            `position: fixed` so it anchors to the viewport regardless of
            this DOM position; routed pages drive the overlay via URL. */}
        <StudentSpaceHost />
        <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
          <main className="flex min-h-0 w-full flex-1 flex-col">
            <Outlet />
          </main>
        </div>
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
