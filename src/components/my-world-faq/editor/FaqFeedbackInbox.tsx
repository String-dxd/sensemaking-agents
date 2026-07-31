import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import {
  loadMyWorldFaqFeedbackInbox,
  type MyWorldFaqFeedbackInboxResponse,
} from '~/server/my-world-faq-feedback.functions'

export function FaqFeedbackInbox() {
  const [data, setData] = useState<MyWorldFaqFeedbackInboxResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await loadMyWorldFaqFeedbackInbox())
    } catch {
      setData({ status: 'unavailable' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section
      aria-labelledby="faq-feedback-inbox-title"
      className="border-b border-(--color-faq-line-strong) bg-(--color-faq-blue) px-5 py-8 text-(--color-faq-ink)"
    >
      <Card className="mx-auto w-full max-w-5xl rounded-[1.5rem_0.5rem_1.5rem_0.5rem] border-(--color-faq-line-strong) bg-(--color-faq-paper) p-4 shadow-none sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-(--color-faq-stage-ink)">
              Build together
            </p>
            <h2 id="faq-feedback-inbox-title" className="mt-1 text-xl font-semibold">
              Anonymous feedback inbox
            </h2>
            <p className="mt-1 text-sm text-(--color-faq-ink-soft)">
              Public submissions appear below the form. Newest entries appear first here.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
            className="min-h-11 gap-2 border-(--color-faq-ink)"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {loading && data === null ? (
          <p className="mt-6 text-sm text-(--color-faq-ink-soft)">Loading feedback…</p>
        ) : data?.status === 'ready' ? (
          data.items.length > 0 ? (
            <ol className="mt-6 grid gap-3">
              {data.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-(--color-faq-line) bg-(--color-faq-surface) p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge
                      variant="outline"
                      className="border-(--color-faq-line-strong) capitalize"
                    >
                      {item.kind}
                    </Badge>
                    <time
                      dateTime={item.createdAt}
                      className="text-xs text-(--color-faq-ink-faint)"
                    >
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(item.createdAt))}
                    </time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{item.message}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-sm text-(--color-faq-ink-soft)">No feedback yet.</p>
          )
        ) : (
          <p className="mt-6 text-sm font-semibold text-(--color-faq-coral-ink)">
            The feedback inbox is unavailable right now.
          </p>
        )}
      </Card>
    </section>
  )
}
