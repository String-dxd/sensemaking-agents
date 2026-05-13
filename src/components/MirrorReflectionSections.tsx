import type { MirrorEditableField, MirrorEntryRow } from '~/db/queries'

const MIRROR_SECTIONS: Array<{
  field: MirrorEditableField
  label: string
  description: string
}> = [
  {
    field: 'validation',
    label: 'Validation',
    description: 'What Mirror heard and names back.',
  },
  {
    field: 'inferred_meaning',
    label: 'Inferred meaning',
    description: 'What this moment may be pointing toward.',
  },
  {
    field: 'story_reframe',
    label: 'Story reframe',
    description: 'A re-told version of the reflection.',
  },
]

type MirrorReflectionEntry = Pick<
  MirrorEntryRow,
  'validation' | 'inferred_meaning' | 'story_reframe'
>

export function MirrorReflectionSections({
  entry,
  compact = false,
}: {
  entry: MirrorReflectionEntry
  compact?: boolean
}) {
  return (
    <div
      className={compact ? 'grid gap-2 md:grid-cols-3' : 'flex flex-col gap-3'}
      data-testid="mirror-reflection-sections"
    >
      {MIRROR_SECTIONS.map((section) => (
        <section
          key={section.field}
          className="rounded-md border border-border/40 bg-muted/20 p-3"
          data-testid={`mirror-section-${section.field}`}
        >
          <div className="flex flex-col gap-0.5">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </h4>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {section.description}
            </p>
          </div>
          <p
            className={[
              'mt-2 text-sm leading-relaxed text-foreground',
              compact ? 'line-clamp-4' : 'whitespace-pre-wrap',
            ].join(' ')}
          >
            {entry[section.field]}
          </p>
        </section>
      ))}
    </div>
  )
}
