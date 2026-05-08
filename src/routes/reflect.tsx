import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export const Route = createFileRoute('/reflect')({
  component: ReflectPage,
})

/**
 * Placeholder during the quiet-mirror pivot. U4 replaces this with the
 * webcam mirror UI (MediaRecorder + Whisper + async Mirror agent).
 */
function ReflectPage() {
  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reflect</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Self-directed reflection ritual. Look into the mirror, talk to yourself for ~60–90
          seconds, stop. Mirror reflects back what it heard in three parts. v0.1 has no auth, so
          every session writes to <code className="text-foreground">student_id = 'demo'</code>.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Mirror</CardTitle>
          <CardDescription>
            Webcam-as-mirror UI lands in U4. The wiring (Whisper transcription + async Mirror agent
            + persistence) is ready.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">U4 is up next. The button will live here.</p>
        </CardContent>
      </Card>
    </section>
  )
}
