import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MirrorSession } from '~/components/MirrorSession'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export const Route = createFileRoute('/reflect')({
  component: ReflectPage,
})

function ReflectPage() {
  const navigate = useNavigate()
  return (
    <section className="flex flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Reflect</h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Self-directed reflection. Look into the mirror. Talk to yourself for as long as you want
          (or up to ~90 seconds). When you stop, Mirror reflects back what it heard in three parts.
          v0.1 has no auth, so every session writes to{' '}
          <code className="text-foreground">student_id = 'demo'</code>.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Mirror</CardTitle>
          <CardDescription>
            Webcam-as-mirror. Audio captured locally and transcribed via Whisper after Stop. No AI
            voice during the session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MirrorSession
            studentId="demo"
            onPersisted={(entryId) => {
              void navigate({ to: '/wiki/$entryId', params: { entryId: String(entryId) } })
            }}
          />
        </CardContent>
      </Card>
    </section>
  )
}
