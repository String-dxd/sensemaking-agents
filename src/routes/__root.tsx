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
import { demoSignInHref, workosSignInHref } from '~/auth/demo'
import { AgentDebugPanel } from '~/components/AgentDebugPanel'
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
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-8">
          <header className="flex items-center justify-between gap-4">
            <Link to="/reflect" className="text-sm font-semibold tracking-tight">
              Sensemaking agents
            </Link>
            <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <Link
                to="/reflect"
                className="hover:text-foreground"
                activeProps={{ className: 'text-foreground' }}
              >
                reflect
              </Link>
              <Link
                to="/library"
                className="hover:text-foreground"
                activeProps={{ className: 'text-foreground' }}
              >
                library
              </Link>
              <details className="group relative">
                <summary className="cursor-pointer list-none rounded px-2 py-1 text-sm hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  profile
                </summary>
                <div className="absolute right-0 z-20 mt-2 flex min-w-40 flex-col gap-1 rounded-md border border-border bg-background p-2 text-xs shadow-sm">
                  <a
                    className="rounded px-2 py-1.5 hover:bg-muted hover:text-foreground"
                    href={workosSignInHref('/reflect')}
                  >
                    sign in
                  </a>
                  <form action={demoSignInHref('/reflect')} method="post">
                    <button
                      type="submit"
                      className="w-full rounded px-2 py-1.5 text-left hover:bg-muted hover:text-foreground"
                    >
                      use demo account
                    </button>
                  </form>
                  <a
                    className="rounded px-2 py-1.5 hover:bg-muted hover:text-foreground"
                    href="/api/auth/sign-out"
                  >
                    sign out
                  </a>
                </div>
              </details>
            </nav>
          </header>
          {import.meta.env.DEV ? <AgentDebugPanel /> : null}
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
