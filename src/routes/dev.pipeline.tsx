import { createFileRoute, notFound } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { CartographerOutputRow, MirrorReviewStatus, VipsProposedDiffRow } from '~/db/queries'
import { cn } from '~/lib/utils'
import { loadPipelineTrace } from '~/server/load-pipeline-trace.functions'
import type { PipelineMirrorRow, PipelineTraceResult } from '~/server/load-pipeline-trace.types'

export const Route = createFileRoute('/dev/pipeline')({
  // Dev-only surface. In production the route 404s before the loader runs so
  // verifier audit data is not reachable from a deployed app.
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound()
  },
  loader: () => loadPipelineTrace(),
  component: PipelinePage,
  errorComponent: PipelineErrorFallback,
})

type FilterState = 'all' | MirrorReviewStatus

function PipelineErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded border border-warning/30 bg-background/90 p-4 text-sm font-mono">
      <p className="font-semibold">/dev/pipeline failed to load.</p>
      <p className="mt-1 text-muted-foreground">{error.message}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded border border-border bg-background px-2 py-1 hover:bg-muted"
        >
          Retry
        </button>
        <span className="self-center text-[11px] text-muted-foreground">
          ⌘K to switch to UI mode
        </span>
      </div>
    </div>
  )
}

// Exported for direct test rendering — the route entry point still wires
// this via `component: PipelinePage` so production behavior is unchanged.
export function PipelinePageView({ data }: { data: PipelineTraceResult }) {
  return <PipelinePageInner data={data} />
}

function PipelinePage() {
  const data = Route.useLoaderData()
  return <PipelinePageInner data={data} />
}

function PipelinePageInner({ data }: { data: PipelineTraceResult }) {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<FilterState>('all')

  const filteredMirrors = useMemo(() => {
    if (filter === 'all') return data.mirrors
    return data.mirrors.filter((m) => m.review_status === filter)
  }, [data.mirrors, filter])

  function toggleRow(id: number) {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="font-mono text-xs leading-relaxed text-foreground">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-4 border-b border-border pb-3">
        <div>
          <h1 className="font-sans text-lg font-semibold">Agent pipeline trace</h1>
          <p className="text-muted-foreground">
            Student: <span className="text-foreground">{data.activeStudentId}</span> · Mirrors{' '}
            {data.totals.mirrors} · Diffs {data.totals.diffs} · Committed{' '}
            {data.totals.committed_timeline}
          </p>
        </div>
        <FilterPills filter={filter} onChange={setFilter} />
      </header>

      <section className="mb-4">
        <h2 className="mb-2 font-sans text-sm font-semibold">
          VIPS pages (current compiled truth)
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {data.pages.map((p) => (
            <article
              key={p.dimension}
              className="rounded border border-border bg-muted/40 px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-sans text-xs font-semibold uppercase tracking-wide">
                  {p.dimension}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {p.updated_at ? formatTime(p.updated_at) : '—'}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-foreground">
                {p.compiled_truth || <span className="text-muted-foreground">(empty)</span>}
              </p>
              {p.open_question ? (
                <p className="mt-1 text-muted-foreground">Q: {p.open_question}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <CartographerCard cartographer={data.cartographer} />

      <section>
        <h2 className="mb-2 font-sans text-sm font-semibold">Mirror entries</h2>
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full min-w-[900px] border-collapse">
            <thead className="bg-muted/40 text-left">
              <tr>
                <Th>id</Th>
                <Th>created_at</Th>
                <Th>context</Th>
                <Th>review</Th>
                <Th className="w-[34%]">transcript</Th>
                <Th>diffs</Th>
                <Th>committed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {filteredMirrors.length === 0 ? (
                <tr>
                  <Td colSpan={8} className="py-6 text-center text-muted-foreground">
                    No mirror entries match the filter.
                  </Td>
                </tr>
              ) : (
                filteredMirrors.map((m) => (
                  <MirrorRow
                    key={m.id}
                    mirror={m}
                    open={openIds.has(m.id)}
                    onToggle={() => toggleRow(m.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-muted-foreground">
        Hit <kbd className="rounded border border-border px-1">⌘K</kbd> to switch to UI mode.
      </p>
    </div>
  )
}

function MirrorRow({
  mirror,
  open,
  onToggle,
}: {
  mirror: PipelineMirrorRow
  open: boolean
  onToggle: () => void
}) {
  const diffSummary = summarizeDiffs(mirror.diffs)
  return (
    <>
      <tr className="border-t border-border hover:bg-muted/30">
        <Td>{mirror.id}</Td>
        <Td>{formatTime(mirror.created_at)}</Td>
        <Td>{mirror.context_type}</Td>
        <Td>
          <StatusBadge value={mirror.review_status} />
        </Td>
        <Td className="max-w-0 truncate" title={mirror.transcript}>
          {mirror.transcript}
        </Td>
        <Td>{diffSummary}</Td>
        <Td>{mirror.committed_timeline.length}</Td>
        <Td>
          <button
            type="button"
            onClick={onToggle}
            className="rounded border border-border px-2 py-0.5 hover:bg-muted"
            aria-expanded={open}
          >
            {open ? 'hide' : 'show'}
          </button>
        </Td>
      </tr>
      {open ? <MirrorDetailRow mirror={mirror} /> : null}
    </>
  )
}

function MirrorDetailRow({ mirror }: { mirror: PipelineMirrorRow }) {
  return (
    <tr className="border-t border-border bg-muted/20">
      <td colSpan={8} className="px-3 py-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DetailBlock title="Mirror — validation">
            <p className="whitespace-pre-wrap">{mirror.validation}</p>
          </DetailBlock>
          <DetailBlock title="Mirror — inferred_meaning">
            <p className="whitespace-pre-wrap">{mirror.inferred_meaning}</p>
          </DetailBlock>
          <DetailBlock title="Mirror — story_reframe" className="lg:col-span-2">
            <p className="whitespace-pre-wrap">{mirror.story_reframe}</p>
          </DetailBlock>
          <DetailBlock title="Transcript (full)" className="lg:col-span-2">
            <p className="whitespace-pre-wrap">{mirror.transcript}</p>
          </DetailBlock>
          <DetailBlock title={`Verifier diffs (${mirror.diffs.length})`} className="lg:col-span-2">
            {mirror.diffs.length === 0 ? (
              <p className="text-muted-foreground">No Connector run touched this mirror entry.</p>
            ) : (
              <ul className="space-y-2">
                {mirror.diffs.map((d) => (
                  <li key={d.id} className="rounded border border-border bg-background p-2">
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span>
                        diff #{d.id} · <StatusBadge value={d.status} />
                      </span>
                      <span className="text-muted-foreground">{formatTime(d.created_at)}</span>
                    </div>
                    <LazyBlob label="payload" value={d.payload} />
                    <LazyBlob label="verifier_result" value={d.verifier_result} />
                  </li>
                ))}
              </ul>
            )}
          </DetailBlock>
          <DetailBlock
            title={`Committed claims (${mirror.committed_timeline.length})`}
            className="lg:col-span-2"
          >
            {mirror.committed_timeline.length === 0 ? (
              <p className="text-muted-foreground">No claims committed from this entry yet.</p>
            ) : (
              <ul className="space-y-1">
                {mirror.committed_timeline.map((t) => {
                  const parallax = Array.isArray(t.parallax_tag) ? t.parallax_tag : []
                  return (
                    <li key={t.id} className="rounded bg-background px-2 py-1">
                      <span className="font-semibold">{t.dimension}</span> · {t.canonical_claim_id}{' '}
                      · <span className="text-muted-foreground">strength={t.strength}</span> ·{' '}
                      parallax=[{parallax.join(', ')}]
                      {t.forgotten_at ? (
                        <span className="ml-1 rounded bg-warning/20 px-1 text-warning">
                          forgotten
                        </span>
                      ) : null}
                      <div className="mt-0.5 text-muted-foreground">“{t.verbatim_quote}”</div>
                    </li>
                  )
                })}
              </ul>
            )}
          </DetailBlock>
        </div>
      </td>
    </tr>
  )
}

function CartographerCard({ cartographer }: { cartographer: CartographerOutputRow | null }) {
  if (!cartographer) {
    return (
      <section className="mb-4 rounded border border-dashed border-border bg-muted/30 px-3 py-2">
        <h2 className="font-sans text-sm font-semibold">Cartographer</h2>
        <p className="text-muted-foreground">
          No Cartographer run yet for this student. Trajectory synthesizes once enough verified
          evidence accumulates.
        </p>
      </section>
    )
  }
  return (
    <section className="mb-4 rounded border border-border bg-muted/40 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-sans text-sm font-semibold">Cartographer · latest Trajectory</h2>
        <span className="text-[10px] text-muted-foreground">
          {formatTime(cartographer.created_at)} · #{cartographer.id}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap">{cartographer.trajectory_text}</p>
      {cartographer.pathways.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            pathways ({cartographer.pathways.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {cartographer.pathways.map((p) => {
              const traits = Array.isArray(p.trait_combination) ? p.trait_combination : []
              return (
                <li key={p.label} className="rounded bg-background px-2 py-1">
                  <div className="font-semibold">{p.label}</div>
                  <div className="mt-0.5 text-muted-foreground">
                    traits: {traits.map((t) => `${t.dimension}.${t.claim_id}`).join(', ') || '—'}
                  </div>
                  {p.risks_tradeoffs ? (
                    <div className="mt-0.5">risks: {p.risks_tradeoffs}</div>
                  ) : null}
                  {p.exploration_prompt ? (
                    <div className="mt-0.5">→ {p.exploration_prompt}</div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </details>
      ) : null}
      {cartographer.open_questions.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-muted-foreground">
          {cartographer.open_questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function FilterPills({
  filter,
  onChange,
}: {
  filter: FilterState
  onChange: (next: FilterState) => void
}) {
  const options: FilterState[] = ['all', 'pending', 'confirmed', 'forgotten']
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'rounded border border-border px-2 py-0.5 text-xs',
            filter === opt ? 'bg-foreground text-background' : 'bg-background hover:bg-muted',
          )}
          aria-pressed={filter === opt}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'confirmed'
      ? 'bg-emerald-500/15 text-emerald-700'
      : value === 'forgotten'
        ? 'bg-zinc-500/15 text-zinc-700'
        : 'bg-amber-500/15 text-amber-700'
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide', tone)}>
      {value}
    </span>
  )
}

function DetailBlock({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded border border-border bg-background p-2', className)}>
      <div className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  )
}

function LazyBlob({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        {label}
      </summary>
      {open ? (
        <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2">
          {safeStringify(value)}
        </pre>
      ) : null}
    </details>
  )
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'px-2 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  className,
  colSpan,
  title,
}: {
  children?: React.ReactNode
  className?: string
  colSpan?: number
  title?: string
}) {
  return (
    <td className={cn('px-2 py-1.5 align-top', className)} colSpan={colSpan} title={title}>
      {children}
    </td>
  )
}

function summarizeDiffs(diffs: VipsProposedDiffRow[]): string {
  if (diffs.length === 0) return '0'
  const counts = { pending: 0, confirmed: 0, forgotten: 0 }
  for (const d of diffs) counts[d.status]++
  const parts: string[] = []
  if (counts.confirmed) parts.push(`${counts.confirmed}c`)
  if (counts.pending) parts.push(`${counts.pending}p`)
  if (counts.forgotten) parts.push(`${counts.forgotten}f`)
  return `${diffs.length} (${parts.join(' / ')})`
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toISOString().replace('T', ' ').replace(/\..+$/, '')
  } catch {
    return iso
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
