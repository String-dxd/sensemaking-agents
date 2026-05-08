import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { mintMirrorSession } from '~/server/mirror-session.functions'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const probe = useQuery({
    queryKey: ['mirror-session-probe'],
    queryFn: () => mintMirrorSession(),
  })

  return (
    <section className="flex flex-col gap-8 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          A wiki for what you've been figuring out.
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Mirror listens for two minutes. Connector and Pathfinder reread the wiki nightly and add
          patterns and pathways. You edit and confirm — nothing is decided for you.
        </p>
      </div>
      {/* U1 wiring probe — proves the TanStack server fn round-trips. */}
      <p className="text-xs text-muted-foreground" data-testid="server-fn-probe">
        server fn: {probe.isPending ? 'loading…' : probe.data?.ok ? 'ok' : 'not ok'}
      </p>
    </section>
  )
}
