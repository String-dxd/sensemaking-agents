import { createContext, type ReactNode, useContext, useMemo } from 'react'
import { Badge } from '~/components/ui/badge'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import type {
  FaqEditorialFieldDefinition,
  MyWorldFaqEditorialDocument,
  MyWorldFaqValidationIssue,
  MyWorldFaqValidationWarning,
} from '~/data/my-world-faq'
import type { MyWorldFaqEditorManifestContract } from '~/server/my-world-faq-editor.functions'
import type { MyWorldFaqFieldPresentation, MyWorldFaqFieldRenderArgs } from '../FaqFieldRenderer'

interface FaqEditorContextValue {
  fields: readonly FaqEditorialFieldDefinition[]
  limits: MyWorldFaqEditorManifestContract['limits']
  working: MyWorldFaqEditorialDocument
  dirtyPaths: ReadonlySet<string>
  errors: readonly MyWorldFaqValidationIssue[]
  warnings: readonly MyWorldFaqValidationWarning[]
  disabled: boolean
  updateField(path: string, value: string): void
}

const FaqEditorContext = createContext<FaqEditorContextValue | null>(null)

export function FaqEditorProvider({
  children,
  value,
}: {
  children: ReactNode
  value: FaqEditorContextValue
}) {
  return <FaqEditorContext.Provider value={value}>{children}</FaqEditorContext.Provider>
}

export function EditableFaqField({ path, label, value, presentation }: MyWorldFaqFieldRenderArgs) {
  const editor = useContext(FaqEditorContext)
  if (!editor) throw new Error('EditableFaqField must be rendered inside FaqEditorProvider.')

  const definition = editor.fields.find((field) => field.path === path)
  if (!definition) throw new Error(`The FAQ editor manifest does not include ${path}.`)

  const controlId = `faq-editor-${path.replaceAll('.', '-')}`
  const descriptionId = `${controlId}-description`
  const fieldErrors = editor.errors.filter((issue) => issue.path === path)
  const fieldWarnings = editor.warnings.filter((warning) => warning.path === path)
  const dirty = editor.dirtyPaths.has(path)
  const resolvedPresentation = presentation ?? presentationForCategory(definition.category)
  const fieldLimit = editor.limits[definition.category]
  const count = useMemo(
    () => countForField(definition.category, fieldLimit, value),
    [definition.category, fieldLimit, value],
  )
  const guidance = guidanceForField(definition.category, fieldLimit)
  const invalid = fieldErrors.length > 0
  const describedBy = descriptionId

  const sharedProps = {
    id: controlId,
    name: path,
    value,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
    'data-editor-path': path,
    'data-dirty': dirty || undefined,
    disabled: editor.disabled,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      editor.updateField(path, event.currentTarget.value),
    className:
      'min-h-11 border-(--color-faq-line-strong) bg-(--color-faq-surface) text-sm font-normal leading-relaxed text-(--color-faq-ink) shadow-none focus-visible:ring-(--color-faq-focus)',
  }

  return (
    <span className="my-2 block w-full rounded-xl bg-(--color-faq-paper)/92 p-2.5 text-left font-sans text-sm leading-normal tracking-normal whitespace-normal normal-case not-italic [text-wrap:wrap] text-(--color-faq-ink) ring-1 ring-(--color-faq-line)">
      <span className="mb-2 flex min-h-5 flex-wrap items-center justify-between gap-2">
        <Label htmlFor={controlId} className="text-xs font-semibold text-(--color-faq-ink)">
          {label}
        </Label>
        <span className="flex items-center gap-2">
          {dirty ? (
            <Badge
              variant="outline"
              size="sm"
              className="border-(--color-faq-stage-line) bg-(--color-faq-stage-soft) text-(--color-faq-stage-ink)"
            >
              Edited
            </Badge>
          ) : null}
          <span className="text-[11px] font-normal tabular-nums text-(--color-faq-ink-faint)">
            {count}
          </span>
        </span>
      </span>
      {resolvedPresentation === 'multi-line' ? (
        <Textarea
          {...sharedProps}
          rows={rowsForCategory(definition.category)}
          className={`${sharedProps.className} resize-y`}
        />
      ) : (
        <Input
          {...sharedProps}
          type={resolvedPresentation === 'url' ? 'url' : 'text'}
          inputMode={resolvedPresentation === 'url' ? 'url' : undefined}
        />
      )}
      <span
        id={descriptionId}
        className={`mt-2 block text-xs font-normal leading-relaxed ${
          invalid ? 'text-(--color-faq-coral-ink)' : 'text-(--color-faq-ink-faint)'
        }`}
        role={invalid ? 'alert' : undefined}
      >
        {fieldErrors[0]?.message ?? fieldWarnings[0]?.message ?? guidance}
      </span>
    </span>
  )
}

function presentationForCategory(
  category: FaqEditorialFieldDefinition['category'],
): MyWorldFaqFieldPresentation {
  if (category === 'url') return 'url'
  if (
    category === 'route-title' ||
    category === 'route-description' ||
    category === 'label' ||
    category === 'compact'
  ) {
    return 'single-line'
  }
  return 'multi-line'
}

function rowsForCategory(category: FaqEditorialFieldDefinition['category']): number {
  if (category === 'transcript') return 10
  if (category === 'body') return 7
  if (category === 'question' || category === 'short-answer') return 4
  return 3
}

function graphemeCount(value: string): number {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)].length
  }
  return [...value].length
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

type EditorialFieldLimit =
  MyWorldFaqEditorManifestContract['limits'][FaqEditorialFieldDefinition['category']]

function countForField(
  category: FaqEditorialFieldDefinition['category'],
  limit: EditorialFieldLimit,
  value: string,
): string {
  if (category === 'url' && 'maxBytes' in limit) {
    return `${utf8ByteCount(value)} / ${limit.maxBytes} UTF-8 bytes`
  }

  const graphemes = graphemeCount(value)
  if (category === 'short-answer' && 'minWords' in limit) {
    return `${wordCount(value)} words · ${graphemes} / ${limit.maxGraphemes} graphemes`
  }
  if ('maxGraphemes' in limit) {
    return `${graphemes} / ${limit.maxGraphemes} graphemes`
  }
  return `${graphemes} graphemes`
}

function guidanceForField(
  category: FaqEditorialFieldDefinition['category'],
  limit: EditorialFieldLimit,
): string {
  if (category === 'url' && 'maxBytes' in limit) {
    return `Use an absolute HTTPS URL up to ${limit.maxBytes} UTF-8 bytes.`
  }
  if (category === 'short-answer' && 'minWords' in limit) {
    return `Use ${limit.minWords} to ${limit.maxWords} words and no more than ${limit.maxGraphemes} graphemes.`
  }
  if ('warningGraphemes' in limit) {
    return `Aim for ${limit.warningGraphemes} graphemes or fewer; maximum ${limit.maxGraphemes}.`
  }
  if ('maxGraphemes' in limit) {
    return `Maximum ${limit.maxGraphemes} graphemes.`
  }
  return 'Enter the current editorial copy.'
}

function utf8ByteCount(value: string): number {
  return new TextEncoder().encode(value).byteLength
}
