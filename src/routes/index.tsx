import { createFileRoute, Link } from '@tanstack/react-router'
import { demoSignInHref, workosSignInHref } from '~/auth/demo'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/')({
  validateSearch: (search) => ({
    authError:
      search.authError === 'workos_unconfigured' || search.authError === 'auth_failed'
        ? search.authError
        : undefined,
  }),
  component: LandingPage,
})

function LandingPage() {
  const { authError } = Route.useSearch()
  return (
    <section className="flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          A wiki for what you've been figuring out.
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Mirror listens for two minutes. Connector and Pathfinder reread the library nightly and
          add patterns and pathways. You edit and confirm — nothing is decided for you.
        </p>
      </div>
      {authError === 'workos_unconfigured' ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
          Google sign-in is not configured for this deployment yet. The demo account is available.
        </div>
      ) : null}
      {authError === 'auth_failed' ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-muted-foreground">
          Sign-in could not be completed. Try again or use the demo account.
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Link to="/reflect">
          <Button variant="accent" size="lg">
            Start a reflection
          </Button>
        </Link>
        <Link to="/library">
          <Button variant="outline" size="lg">
            Open wiki
          </Button>
        </Link>
        <a
          className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 font-medium text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          href={workosSignInHref('/reflect')}
        >
          Sign in
        </a>
        <form action={demoSignInHref('/reflect')} method="post">
          <Button type="submit" size="lg">
            Try demo account
          </Button>
        </form>
      </div>
    </section>
  )
}
