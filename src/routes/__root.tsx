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
            <Link
              to="/"
              search={{ authError: undefined }}
              className="text-sm font-semibold tracking-tight"
            >
              sensemaking · v0.1
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
              <Link
                to="/reflect/review"
                className="text-xs hover:text-foreground"
                activeProps={{ className: 'text-foreground' }}
              >
                review
              </Link>
              <a className="text-xs hover:text-foreground" href={workosSignInHref('/reflect')}>
                sign in
              </a>
              <form action={demoSignInHref('/reflect')} method="post">
                <button type="submit" className="text-xs hover:text-foreground">
                  try demo
                </button>
              </form>
              <a className="text-xs hover:text-foreground" href="/api/auth/sign-out">
                sign out
              </a>
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
