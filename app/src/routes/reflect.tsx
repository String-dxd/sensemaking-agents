import { createFileRoute } from '@tanstack/react-router'
import { MirrorSession } from '~/components/MirrorSession'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export const Route = createFileRoute('/reflect')({
  component: ReflectPage,
})

function ReflectPage() {
  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reflect</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Mirror listens for ~60 seconds and surfaces signals you can edit. v0.1 has no auth, so
          every session writes to <code className="text-foreground">student_id = 'demo'</code>.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Voice (live)</CardTitle>
          <CardDescription>
            Direct browser → OpenAI Realtime via WebRTC. The ephemeral session token is minted by
            the server; the API key never ships to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MirrorSession studentId="demo" />
          <p className="text-xs text-muted-foreground">
            U4 ships the bare voice path. U5 adds the corpus-search tool and session-end
            persistence.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
