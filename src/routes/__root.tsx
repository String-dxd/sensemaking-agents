import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { DevPalette } from '~/components/DevPalette'
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
        <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
          <main className="flex min-h-0 w-full flex-1 flex-col">
            <Outlet />
          </main>
        </div>
        {/* Dev-only Cmd-K palette. Tree-shaken out of production bundles so
            the keybinding and developer commands do not ship to end users. */}
        {import.meta.env.DEV ? <DevPalette /> : null}
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
