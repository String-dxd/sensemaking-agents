import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
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
      <div className="flex gap-3">
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
      </div>
    </section>
  )
}
