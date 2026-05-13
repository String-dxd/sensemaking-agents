import { createFileRoute, Link } from '@tanstack/react-router'
import { loadAuthMenu } from '~/server/auth-menu.functions'

export const Route = createFileRoute('/me')({
  loader: () => loadAuthMenu(),
  component: MePage,
})

function MePage() {
  const authMenu = Route.useLoaderData()
  return (
    <section className="flex flex-col gap-6 py-6" data-testid="me-page">
      <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
        back to island
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Profile
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {authMenu.status === 'signed-in' ? authMenu.label : 'Your space'}
        </h1>
        {authMenu.status === 'signed-in' && authMenu.detail ? (
          <p className="text-sm text-muted-foreground">{authMenu.detail}</p>
        ) : null}
      </header>
      <div className="rounded-lg border border-border bg-background p-4">
        <h2 className="text-sm font-semibold">Reflection settings</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          Audio reflection remains private to the current Mirror flow. No camera capture or visual
          frame is added by the island.
        </p>
      </div>
    </section>
  )
}
