import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
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
      { title: 'Sensemaking Agents' },
      {
        name: 'description',
        content: 'Mirror, Connector, Pathfinder — a per-student wiki of reflections.',
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
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-8">
          <header className="flex items-center justify-between">
            <Link to="/" className="text-sm font-semibold tracking-tight">
              sensemaking · v0.1
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link
                to="/reflect"
                className="hover:text-foreground"
                activeProps={{ className: 'text-foreground' }}
              >
                reflect
              </Link>
              <Link
                to="/wiki"
                className="hover:text-foreground"
                activeProps={{ className: 'text-foreground' }}
              >
                wiki
              </Link>
            </nav>
          </header>
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
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
