import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouterState,
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
        content: 'Mirror, Connector, Cartographer — a per-student library of reflections.',
      },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: RootComponent,
})

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isWorld = pathname === '/'
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-8">
          {isWorld ? null : (
            <header className="flex items-center justify-between">
              <Link to="/" className="text-sm font-semibold tracking-tight">
                sensemaking · v0.1
              </Link>
              <nav className="flex items-center gap-4 text-sm text-muted-foreground">
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
              </nav>
            </header>
          )}
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
