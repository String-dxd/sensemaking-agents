import { z } from 'zod'
import {
  FAQ_EDITABLE_FIELDS,
  FAQ_EDITORIAL_FIELD_LIMITS,
  FAQ_LOCKED_STRUCTURE,
  type FaqEditorialFieldDefinition,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_STRUCTURE_VERSION,
} from './content-manifest'
import { FAQ_EVIDENCE_LABELS, FAQ_GUARDRAIL_STATES } from './types'

const requiredText = z.string().min(1)
const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0))
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === (month ?? 1) - 1 &&
    parsed.getUTCDate() === day
  )
}, 'Expected a real ISO calendar date')

const reviewStatus = z.enum([
  'repo-verified',
  'source-reviewed',
  'team-verification-required',
  'pilot-required',
  'team-check-required',
  'draft-awaiting-human-review',
])
const evidenceKind = z.enum(['how-it-works', 'research', 'field-signal', 'unknown', 'pilot-test'])
const sourceKind = z.enum([
  'official-guidance',
  'official-policy',
  'evidence-review',
  'systematic-review',
  'meta-analysis',
  'primary-study',
  'working-paper',
])
const assetKind = z.enum(['product-step', 'event-signal'])
const assetApproval = z.enum(['approved', 'team-check'])

const reviewSchema = z.strictObject({
  status: reviewStatus,
  reviewerRole: requiredText,
  lastReviewed: isoDate,
})

const evidenceBlockSchema = z.strictObject({
  id: requiredText,
  kind: evidenceKind,
  heading: requiredText,
  label: z.enum(FAQ_EVIDENCE_LABELS),
  text: requiredText,
  sourceIds: z.array(requiredText),
  provenanceIds: z.array(requiredText),
  guardrailIds: z.array(requiredText),
  populationContext: requiredText,
  fit: requiredText,
  limitations: requiredText,
  review: reviewSchema,
})

const questionSchema = z.strictObject({
  id: requiredText,
  slug: requiredText,
  clusterId: requiredText,
  order: z.number().int().positive(),
  title: requiredText,
  displayedQuestion: requiredText,
  committedQuestions: z.array(requiredText),
  searchAliases: z.array(requiredText),
  shortAnswer: requiredText,
  blocks: z.array(evidenceBlockSchema).min(1),
  guardrailIds: z.array(requiredText),
  assetIds: z.array(requiredText),
  review: reviewSchema,
})

const sourceSchema = z.strictObject({
  id: requiredText,
  kind: sourceKind,
  title: requiredText,
  publisher: requiredText,
  authors: z.array(requiredText).min(1),
  published: requiredText,
  url: requiredText,
  identifier: requiredText.optional(),
  populationContext: requiredText,
  method: requiredText,
  fit: requiredText,
  limitations: requiredText,
  lastChecked: isoDate,
})

const provenanceSchema = z.strictObject({
  id: requiredText,
  title: requiredText,
  repoPaths: z.array(requiredText).min(1),
  claimScope: requiredText,
  populationContext: requiredText,
  fit: requiredText,
  limitations: requiredText,
  lastChecked: isoDate,
})

const guardrailSchema = z.strictObject({
  id: requiredText,
  state: z.enum(FAQ_GUARDRAIL_STATES),
  title: requiredText,
  protects: requiredText,
  statusSummary: requiredText,
  label: z.enum(FAQ_EVIDENCE_LABELS),
  sourceIds: z.array(requiredText),
  provenanceIds: z.array(requiredText),
  questionIds: z.array(requiredText).min(1),
  populationContext: requiredText,
  fit: requiredText,
  limitations: requiredText,
  review: reviewSchema,
})

const assetSchema = z.strictObject({
  id: requiredText,
  kind: assetKind,
  publicPath: requiredText,
  videoPath: requiredText.optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: requiredText,
  transcript: requiredText,
  provenance: requiredText,
  cropNote: requiredText,
  approval: assetApproval,
  capturedOrReceivedOn: isoDate,
  lastReviewed: isoDate,
})

export const MY_WORLD_FAQ_DOCUMENT_SCHEMA = z.strictObject({
  schemaVersion: z.literal(MY_WORLD_FAQ_SCHEMA_VERSION),
  structureVersion: z.literal(MY_WORLD_FAQ_STRUCTURE_VERSION),
  route: z.strictObject({
    title: requiredText,
    description: requiredText,
  }),
  page: z.strictObject({
    hero: z.strictObject({
      eyebrow: requiredText,
      heading: requiredText,
      headingAccent: requiredText,
      introduction: requiredText,
      productCta: requiredText,
      faqCta: requiredText,
    }),
    product: z.strictObject({
      eyebrow: requiredText,
      heading: requiredText,
      introduction: requiredText,
      footnote: requiredText,
    }),
    signals: z.strictObject({
      eyebrow: requiredText,
      heading: requiredText,
      introduction: requiredText,
    }),
    ledger: z.strictObject({
      eyebrow: requiredText,
      heading: requiredText,
      introduction: requiredText,
    }),
    faq: z.strictObject({
      eyebrow: requiredText,
      heading: requiredText,
      introduction: requiredText,
    }),
    contribution: z.strictObject({
      eyebrow: requiredText,
      heading: requiredText,
      body: requiredText,
    }),
    footer: z.strictObject({
      brand: requiredText,
      sharing: requiredText,
    }),
  }),
  productSteps: z.array(
    z.strictObject({
      id: requiredText,
      assetId: requiredText,
      title: requiredText,
      heading: requiredText,
      body: requiredText,
      boundary: requiredText,
    }),
  ),
  signalQuotes: z.array(
    z.strictObject({
      id: requiredText,
      className: requiredText,
      text: requiredText,
      contextLabel: requiredText,
    }),
  ),
  ledgerPreview: z.array(
    z.strictObject({
      state: z.enum(FAQ_GUARDRAIL_STATES),
      label: requiredText,
      guardrailId: requiredText,
      description: requiredText,
    }),
  ),
  concernClusters: z.array(
    z.strictObject({
      id: requiredText,
      label: requiredText,
      summary: requiredText,
      order: z.number().int().positive(),
    }),
  ),
  questions: z.array(questionSchema),
  sources: z.array(sourceSchema),
  productProvenance: z.array(provenanceSchema),
  guardrails: z.array(guardrailSchema),
  assets: z.array(assetSchema),
})

export type MyWorldFaqEditorialDocument = z.infer<typeof MY_WORLD_FAQ_DOCUMENT_SCHEMA>
export type MyWorldFaqContent = MyWorldFaqEditorialDocument
export type MyWorldFaqQuestion = MyWorldFaqEditorialDocument['questions'][number]
export type MyWorldFaqEvidenceBlock = MyWorldFaqQuestion['blocks'][number]
export type MyWorldFaqSource = MyWorldFaqEditorialDocument['sources'][number]
export type MyWorldFaqProductProvenance = MyWorldFaqEditorialDocument['productProvenance'][number]

export interface MyWorldFaqValidationIssue {
  path: string
  code:
    | 'schema'
    | 'structure'
    | 'required'
    | 'length'
    | 'word_count'
    | 'url'
    | 'prohibited_claim'
    | 'calibration'
    | 'document_size'
  message: string
}

export interface MyWorldFaqValidationWarning {
  path: string
  code: 'length_warning'
  message: string
}

export type MyWorldFaqValidationResult =
  | {
      success: true
      document: MyWorldFaqEditorialDocument
      warnings: MyWorldFaqValidationWarning[]
    }
  | {
      success: false
      errors: MyWorldFaqValidationIssue[]
      warnings: MyWorldFaqValidationWarning[]
    }

function stablePath(input: unknown, path: PropertyKey[]): string {
  const result: string[] = []
  let current: unknown = input
  for (const key of path) {
    if (Array.isArray(current) && typeof key === 'number') {
      const item = current[key] as { id?: unknown; state?: unknown } | undefined
      const stableKey =
        typeof item?.id === 'string'
          ? item.id
          : typeof item?.state === 'string'
            ? item.state
            : String(key)
      result.push(stableKey)
      current = item
      continue
    }
    result.push(String(key))
    if (current && typeof current === 'object') {
      current = (current as Record<PropertyKey, unknown>)[key]
    }
  }
  return result.join('.')
}

function readPath(document: MyWorldFaqEditorialDocument, path: string): unknown {
  let current: unknown = document
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const numericIndex = /^\d+$/.test(segment) ? Number(segment) : -1
      current =
        numericIndex >= 0
          ? current[numericIndex]
          : current.find((item) => {
              if (!item || typeof item !== 'object') return false
              const record = item as { id?: unknown; state?: unknown }
              return record.id === segment || record.state === segment
            })
      continue
    }
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
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

function validateHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

function lockedStructureOf(document: MyWorldFaqEditorialDocument) {
  return {
    productSteps: document.productSteps.map(({ id, assetId }) => ({ id, assetId })),
    signalQuotes: document.signalQuotes.map(({ id, className }) => ({ id, className })),
    ledgerPreview: document.ledgerPreview.map(({ state, label, guardrailId }) => ({
      state,
      label,
      guardrailId,
    })),
    concernClusters: document.concernClusters.map(({ id, order }) => ({ id, order })),
    questions: document.questions.map((question) => ({
      id: question.id,
      slug: question.slug,
      clusterId: question.clusterId,
      order: question.order,
      title: question.title,
      committedQuestions: question.committedQuestions,
      searchAliases: question.searchAliases,
      guardrailIds: question.guardrailIds,
      assetIds: question.assetIds,
      review: {
        status: question.review.status,
        reviewerRole: question.review.reviewerRole,
      },
      blocks: question.blocks.map((block) => ({
        id: block.id,
        kind: block.kind,
        label: block.label,
        sourceIds: block.sourceIds,
        provenanceIds: block.provenanceIds,
        guardrailIds: block.guardrailIds,
        review: {
          status: block.review.status,
          reviewerRole: block.review.reviewerRole,
        },
      })),
    })),
    sources: document.sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      authorSlots: source.authors.length,
      hasIdentifier: source.identifier !== undefined,
    })),
    productProvenance: document.productProvenance.map(({ id, repoPaths }) => ({
      id,
      repoPaths,
    })),
    guardrails: document.guardrails.map((item) => ({
      id: item.id,
      state: item.state,
      label: item.label,
      sourceIds: item.sourceIds,
      provenanceIds: item.provenanceIds,
      questionIds: item.questionIds,
      review: {
        status: item.review.status,
        reviewerRole: item.review.reviewerRole,
      },
    })),
    assets: document.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      publicPath: asset.publicPath,
      videoPath: asset.videoPath,
      width: asset.width,
      height: asset.height,
      provenance: asset.provenance,
      cropNote: asset.cropNote,
      approval: asset.approval,
      capturedOrReceivedOn: asset.capturedOrReceivedOn,
    })),
  }
}

function checkField(
  document: MyWorldFaqEditorialDocument,
  field: FaqEditorialFieldDefinition,
  errors: MyWorldFaqValidationIssue[],
  warnings: MyWorldFaqValidationWarning[],
) {
  const value = readPath(document, field.path)
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push({ path: field.path, code: 'required', message: 'A value is required.' })
    return
  }

  const limit = FAQ_EDITORIAL_FIELD_LIMITS[field.category]
  if (field.category === 'url') {
    const urlLimit = FAQ_EDITORIAL_FIELD_LIMITS.url
    const bytes = new TextEncoder().encode(value).byteLength
    if (bytes > urlLimit.maxBytes) {
      errors.push({
        path: field.path,
        code: 'length',
        message: `URL exceeds ${urlLimit.maxBytes} UTF-8 bytes.`,
      })
    }
    if (!validateHttpsUrl(value)) {
      errors.push({
        path: field.path,
        code: 'url',
        message: 'Use an absolute HTTPS URL without credentials.',
      })
    }
    return
  }

  const graphemes = graphemeCount(value)
  if ('maxGraphemes' in limit && graphemes > limit.maxGraphemes) {
    errors.push({
      path: field.path,
      code: 'length',
      message: `Value exceeds ${limit.maxGraphemes} graphemes.`,
    })
  }
  if ('warningGraphemes' in limit && graphemes > limit.warningGraphemes) {
    warnings.push({
      path: field.path,
      code: 'length_warning',
      message: `Value is over the ${limit.warningGraphemes}-grapheme layout warning.`,
    })
  }
  if (field.category === 'short-answer') {
    const answerLimit = FAQ_EDITORIAL_FIELD_LIMITS['short-answer']
    const words = wordCount(value)
    if (words < answerLimit.minWords || words > answerLimit.maxWords) {
      errors.push({
        path: field.path,
        code: 'word_count',
        message: `Short answers must contain ${answerLimit.minWords}–${answerLimit.maxWords} words.`,
      })
    }
  }
}

const PROHIBITED_ACCOUNTABLE_CLAIMS = [
  /\b(?:is|acts as|works as) (?:a )?(?:therapist|counsellor)\b/i,
  /\bproven (?:safe|effective)\b/i,
  /\bguarantee(?:d|s)? (?:safety|non-addiction)\b/i,
  /\b(?:MOE|schools?) (?:endorses?|approves?) My World\b/i,
]

function isAccountablePath(path: string): boolean {
  return !path.startsWith('signalQuotes.') && !path.startsWith('sources.')
}

function pushCalibrationErrors(
  document: MyWorldFaqEditorialDocument,
  errors: MyWorldFaqValidationIssue[],
) {
  for (const question of document.questions) {
    for (const block of question.blocks) {
      const path = `questions.${question.id}.blocks.${block.id}`
      if (block.sourceIds.includes('mit-stanford-adult-chatbot-rct-2025')) {
        if (!/adult/i.test(`${block.populationContext} ${block.limitations}`)) {
          errors.push({
            path: `${path}.populationContext`,
            code: 'calibration',
            message: 'Adult-chatbot evidence must retain its adult population context.',
          })
        }
        if (
          !/risk signal|not evidence|cannot establish|does not establish/i.test(
            `${block.fit} ${block.limitations}`,
          )
        ) {
          errors.push({
            path: `${path}.limitations`,
            code: 'calibration',
            message: 'Adult-chatbot evidence must remain a calibrated risk signal.',
          })
        }
      }
      if (
        /student engagement|teacher support|school field[- ]research/i.test(block.text) &&
        block.label !== 'Early field signal · team verify'
      ) {
        errors.push({
          path: `${path}.text`,
          code: 'calibration',
          message: 'Unsupported field signals require the early-signal label.',
        })
      }
    }
  }
}

export function validateMyWorldFaqDocument(input: unknown): MyWorldFaqValidationResult {
  const parsed = MY_WORLD_FAQ_DOCUMENT_SCHEMA.safeParse(input)
  const warnings: MyWorldFaqValidationWarning[] = []
  if (!parsed.success) {
    return {
      success: false,
      warnings,
      errors: parsed.error.issues.map((issue) => ({
        path: stablePath(input, issue.path),
        code: 'schema',
        message: issue.message,
      })),
    }
  }

  const document = parsed.data
  const errors: MyWorldFaqValidationIssue[] = []
  if (JSON.stringify(lockedStructureOf(document)) !== JSON.stringify(FAQ_LOCKED_STRUCTURE)) {
    errors.push({
      path: 'structure',
      code: 'structure',
      message: 'IDs, order, kinds, statuses, assignments, or locked references changed.',
    })
  }

  for (const field of FAQ_EDITABLE_FIELDS) {
    checkField(document, field, errors, warnings)
    const value = readPath(document, field.path)
    if (
      typeof value === 'string' &&
      isAccountablePath(field.path) &&
      PROHIBITED_ACCOUNTABLE_CLAIMS.some((pattern) => pattern.test(value))
    ) {
      errors.push({
        path: field.path,
        code: 'prohibited_claim',
        message: 'This wording crosses the accountable-claim boundary.',
      })
    }
  }

  pushCalibrationErrors(document, errors)
  if (new TextEncoder().encode(JSON.stringify(document)).byteLength > 1_048_576) {
    errors.push({
      path: '',
      code: 'document_size',
      message: 'The complete document exceeds 1 MiB.',
    })
  }

  return errors.length > 0
    ? { success: false, errors, warnings }
    : { success: true, document, warnings }
}
