import { createFileRoute } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'
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
          Mirror listens for ~60 seconds and surfaces signals you can edit. U4 wires the live
          gpt-realtime-2 voice path; this page is the route shell.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Voice (live)</CardTitle>
          <CardDescription>WebRTC direct to OpenAI Realtime — wired in U4.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="accent" disabled data-testid="start-voice-disabled">
            Start a reflection (voice) — coming in U4
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Text fallback</CardTitle>
          <CardDescription>For demos when voice isn't viable.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled data-testid="start-text-disabled">
            Type a reflection — coming in a later cut
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
