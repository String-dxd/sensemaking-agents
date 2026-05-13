import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { MirrorSession } from '~/components/MirrorSession'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'

export const Route = createFileRoute('/reflect/')({
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
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Mirror</CardTitle>
          <CardDescription>
            Audio captured locally and transcribed via Whisper after Stop. No AI voice during the
            session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MirrorSession
            onPersisted={() => {
              // Every newly recorded thought starts in raw-thought review, even
              // if Connector has no library claims to review yet.
              void navigate({
                to: '/library',
                search: { filter: 'need-review' },
              })
            }}
          />
        </CardContent>
      </Card>
    </section>
  )
}
