import { type FormEvent, type ReactNode, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
  fetchEditorJsonWithDeadline,
  MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS,
} from './editor-request'

export function FaqEditorGate({
  unavailable = false,
  checking = false,
  overlay = false,
  onUnlocked,
}: {
  unavailable?: boolean
  checking?: boolean
  overlay?: boolean
  onUnlocked(): void | Promise<void>
}) {
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (checking) {
    return (
      <GateShell overlay={overlay} labelledBy="faq-editor-checking-title">
        <p id="faq-editor-checking-title" role="status" className="text-sm font-semibold">
          Checking editor access…
        </p>
      </GateShell>
    )
  }

  if (unavailable) {
    return (
      <GateShell overlay={overlay} labelledBy="faq-editor-unavailable-title">
        <h1
          id="faq-editor-unavailable-title"
          className="text-2xl font-semibold tracking-[-0.035em]"
        >
          Editor unavailable
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-soft)">
          The editor cannot be opened right now. Try again later.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            className="min-h-11 bg-(--color-faq-ink) text-(--color-faq-paper)"
            onClick={() => void onUnlocked()}
          >
            Try again
          </Button>
          <a
            href="/my-world/faq"
            className="inline-flex min-h-11 items-center rounded-md border border-(--color-faq-ink) px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-(--color-faq-focus)"
          >
            View the FAQ
          </a>
        </div>
      </GateShell>
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const { response, body } = await fetchEditorJsonWithDeadline<{
        ok?: boolean
        error?: string
      }>('/api/my-world/faq/editor/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, password }),
      })
      if (!response.ok || !body?.ok) {
        setError(body?.error ?? 'The editor could not be unlocked. Try again.')
        return
      }
      setPassword('')
      await settleEditorTaskWithinDeadline(Promise.resolve(onUnlocked()))
    } catch {
      setError('The editor could not be unlocked. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GateShell overlay={overlay} labelledBy="faq-editor-gate-title">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
        Team authoring
      </p>
      <h1 id="faq-editor-gate-title" className="mt-3 text-3xl font-semibold tracking-[-0.045em]">
        Edit the My World FAQ
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-(--color-faq-ink-soft)">
        Use the shared team password. Your display name appears with published changes, but it does
        not verify identity.
      </p>
      <form className="mt-7 space-y-5" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="faq-editor-display-name">Display name</Label>
          <Input
            id="faq-editor-display-name"
            name="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            required
            maxLength={80}
            autoFocus={overlay}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="faq-editor-password">Shared password</Label>
          <Input
            id="faq-editor-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm leading-relaxed text-(--color-faq-coral-ink)">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          className="min-h-11 w-full bg-(--color-faq-ink) text-(--color-faq-paper)"
          disabled={submitting}
        >
          {submitting ? 'Unlocking…' : 'Unlock editor'}
        </Button>
      </form>
    </GateShell>
  )
}

function GateShell({
  children,
  overlay = false,
  labelledBy,
}: {
  children: ReactNode
  overlay?: boolean
  labelledBy?: string
}) {
  const className = `grid place-items-center bg-(--color-faq-paper) px-5 py-12 text-(--color-faq-ink) ${
    overlay ? 'fixed inset-0 z-[70] min-h-svh' : 'min-h-svh'
  }`
  const content = (
    <Card className="w-full max-w-md rounded-[2rem_0.75rem_2rem_0.75rem] border-(--color-faq-ink) bg-(--color-faq-surface) p-6 shadow-(--shadow-faq-card) sm:p-8">
      {children}
    </Card>
  )

  if (overlay) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={className}
        data-testid="faq-editor-access-overlay"
      >
        {content}
      </div>
    )
  }

  return <main className={className}>{content}</main>
}

async function settleEditorTaskWithinDeadline<T>(task: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error('FAQ editor task timed out.')),
      MY_WORLD_FAQ_EDITOR_REQUEST_TIMEOUT_MS,
    )
  })

  try {
    return await Promise.race([task, deadline])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
