import { FAQ_ASSETS } from './assets'
import { FAQ_GUARDRAILS } from './guardrails'
import { FAQ_CONCERN_CLUSTERS, FAQ_QUESTIONS } from './questions'
import { FAQ_PRODUCT_PROVENANCE, FAQ_SOURCES } from './sources'

export const MY_WORLD_FAQ_SCHEMA_VERSION = 1 as const
export const MY_WORLD_FAQ_STRUCTURE_VERSION = 1 as const

export const FAQ_PRODUCT_STEP_MANIFEST = [
  { id: 'capture', assetId: 'product-01-capture' },
  { id: 'identity', assetId: 'product-02-sensemake' },
  { id: 'history', assetId: 'product-03-review' },
  { id: 'path-finder', assetId: 'product-04-act-return' },
] as const

export const FAQ_SIGNAL_QUOTE_MANIFEST = [
  { id: 'dinner-table', className: 'faq-signal-card--coral lg:col-span-7' },
  { id: 'safe-home', className: 'faq-signal-card--blue lg:col-span-5' },
  { id: 'validate-demand', className: 'faq-signal-card--yellow lg:col-span-4' },
  { id: 'screen-time', className: 'faq-signal-card--green lg:col-span-8' },
  { id: 'privacy', className: 'faq-signal-card--pink lg:col-span-12' },
] as const

export const FAQ_LEDGER_PREVIEW_MANIFEST = [
  {
    state: 'built-today',
    label: 'Built today',
    guardrailId: 'review-log-forget-controls',
  },
  {
    state: 'required-before-pilot',
    label: 'Required before any pilot',
    guardrailId: 'distress-human-escalation',
  },
  {
    state: 'still-researching',
    label: 'Still researching',
    guardrailId: 'family-peer-displacement',
  },
] as const

export type FaqEditorialFieldCategory =
  | 'route-title'
  | 'route-description'
  | 'compact'
  | 'question'
  | 'short-answer'
  | 'summary'
  | 'body'
  | 'alt'
  | 'transcript'
  | 'url'

export interface FaqEditorialFieldDefinition {
  path: string
  category: FaqEditorialFieldCategory
}

export const FAQ_EDITORIAL_FIELD_LIMITS = {
  'route-title': { warningGraphemes: 60, maxGraphemes: 120 },
  'route-description': { warningGraphemes: 160, maxGraphemes: 320 },
  compact: { warningGraphemes: 96, maxGraphemes: 320 },
  question: { warningGraphemes: 220, maxGraphemes: 360 },
  'short-answer': { minWords: 20, maxWords: 45, maxGraphemes: 600 },
  summary: { warningGraphemes: 600, maxGraphemes: 2_000 },
  body: { maxGraphemes: 8_000 },
  alt: { warningGraphemes: 250, maxGraphemes: 500 },
  transcript: { maxGraphemes: 20_000 },
  url: { maxBytes: 2_048 },
} as const

const fields: FaqEditorialFieldDefinition[] = [
  { path: 'route.title', category: 'route-title' },
  { path: 'route.description', category: 'route-description' },
  { path: 'page.hero.eyebrow', category: 'compact' },
  { path: 'page.hero.heading', category: 'compact' },
  { path: 'page.hero.headingAccent', category: 'compact' },
  { path: 'page.hero.introduction', category: 'summary' },
  { path: 'page.hero.productCta', category: 'compact' },
  { path: 'page.hero.faqCta', category: 'compact' },
  { path: 'page.product.eyebrow', category: 'compact' },
  { path: 'page.product.heading', category: 'compact' },
  { path: 'page.product.introduction', category: 'summary' },
  { path: 'page.product.footnote', category: 'summary' },
  { path: 'page.signals.eyebrow', category: 'compact' },
  { path: 'page.signals.heading', category: 'compact' },
  { path: 'page.signals.introduction', category: 'summary' },
  { path: 'page.ledger.eyebrow', category: 'compact' },
  { path: 'page.ledger.heading', category: 'compact' },
  { path: 'page.ledger.introduction', category: 'summary' },
  { path: 'page.faq.eyebrow', category: 'compact' },
  { path: 'page.faq.heading', category: 'compact' },
  { path: 'page.faq.introduction', category: 'summary' },
  { path: 'page.contribution.eyebrow', category: 'compact' },
  { path: 'page.contribution.heading', category: 'compact' },
  { path: 'page.contribution.body', category: 'summary' },
  { path: 'page.footer.brand', category: 'compact' },
  { path: 'page.footer.sharing', category: 'summary' },
]

for (const step of FAQ_PRODUCT_STEP_MANIFEST) {
  for (const [name, category] of [
    ['title', 'compact'],
    ['heading', 'compact'],
    ['body', 'summary'],
    ['boundary', 'summary'],
  ] as const) {
    fields.push({ path: `productSteps.${step.id}.${name}`, category })
  }
}

for (const quote of FAQ_SIGNAL_QUOTE_MANIFEST) {
  fields.push(
    { path: `signalQuotes.${quote.id}.text`, category: 'summary' },
    { path: `signalQuotes.${quote.id}.contextLabel`, category: 'compact' },
  )
}

for (const item of FAQ_LEDGER_PREVIEW_MANIFEST) {
  fields.push({ path: `ledgerPreview.${item.state}.description`, category: 'summary' })
}

for (const cluster of FAQ_CONCERN_CLUSTERS) {
  fields.push(
    { path: `concernClusters.${cluster.id}.label`, category: 'compact' },
    { path: `concernClusters.${cluster.id}.summary`, category: 'summary' },
  )
}

for (const question of FAQ_QUESTIONS) {
  fields.push(
    { path: `questions.${question.id}.displayedQuestion`, category: 'question' },
    { path: `questions.${question.id}.shortAnswer`, category: 'short-answer' },
  )
  for (const block of question.blocks) {
    for (const [name, category] of [
      ['heading', 'compact'],
      ['text', 'body'],
      ['populationContext', 'body'],
      ['fit', 'body'],
      ['limitations', 'body'],
    ] as const) {
      fields.push({ path: `questions.${question.id}.blocks.${block.id}.${name}`, category })
    }
  }
}

for (const source of FAQ_SOURCES) {
  fields.push(
    { path: `sources.${source.id}.title`, category: 'compact' },
    { path: `sources.${source.id}.publisher`, category: 'compact' },
    { path: `sources.${source.id}.published`, category: 'compact' },
    { path: `sources.${source.id}.url`, category: 'url' },
    { path: `sources.${source.id}.populationContext`, category: 'body' },
    { path: `sources.${source.id}.method`, category: 'body' },
    { path: `sources.${source.id}.fit`, category: 'body' },
    { path: `sources.${source.id}.limitations`, category: 'body' },
  )
  source.authors.forEach((_, index) => {
    fields.push({ path: `sources.${source.id}.authors.${index}`, category: 'compact' })
  })
  if ('identifier' in source) {
    fields.push({ path: `sources.${source.id}.identifier`, category: 'compact' })
  }
}

for (const item of FAQ_PRODUCT_PROVENANCE) {
  fields.push(
    { path: `productProvenance.${item.id}.title`, category: 'compact' },
    { path: `productProvenance.${item.id}.claimScope`, category: 'body' },
    { path: `productProvenance.${item.id}.populationContext`, category: 'body' },
    { path: `productProvenance.${item.id}.fit`, category: 'body' },
    { path: `productProvenance.${item.id}.limitations`, category: 'body' },
  )
}

for (const item of FAQ_GUARDRAILS) {
  for (const [name, category] of [
    ['title', 'compact'],
    ['protects', 'summary'],
    ['statusSummary', 'summary'],
    ['populationContext', 'body'],
    ['fit', 'body'],
    ['limitations', 'body'],
  ] as const) {
    fields.push({ path: `guardrails.${item.id}.${name}`, category })
  }
}

for (const asset of FAQ_ASSETS) {
  fields.push(
    { path: `assets.${asset.id}.alt`, category: 'alt' },
    { path: `assets.${asset.id}.transcript`, category: 'transcript' },
  )
}

export const FAQ_EDITABLE_FIELDS = Object.freeze(fields)
export const FAQ_EDITABLE_PATHS = Object.freeze(fields.map((field) => field.path))

export const FAQ_LOCKED_STRUCTURE = {
  productSteps: FAQ_PRODUCT_STEP_MANIFEST.map(({ id, assetId }) => ({ id, assetId })),
  signalQuotes: FAQ_SIGNAL_QUOTE_MANIFEST.map(({ id, className }) => ({ id, className })),
  ledgerPreview: FAQ_LEDGER_PREVIEW_MANIFEST.map(({ state, label, guardrailId }) => ({
    state,
    label,
    guardrailId,
  })),
  concernClusters: FAQ_CONCERN_CLUSTERS.map(({ id, order }) => ({ id, order })),
  questions: FAQ_QUESTIONS.map((question) => ({
    id: question.id,
    slug: question.slug,
    clusterId: question.clusterId,
    order: question.order,
    title: question.title,
    committedQuestions: [...question.committedQuestions],
    searchAliases: [...question.searchAliases],
    guardrailIds: [...question.guardrailIds],
    assetIds: [...question.assetIds],
    review: {
      status: question.review.status,
      reviewerRole: question.review.reviewerRole,
    },
    blocks: question.blocks.map((block) => ({
      id: block.id,
      kind: block.kind,
      label: block.label,
      sourceIds: [...block.sourceIds],
      provenanceIds: [...block.provenanceIds],
      guardrailIds: [...block.guardrailIds],
      review: {
        status: block.review.status,
        reviewerRole: block.review.reviewerRole,
      },
    })),
  })),
  sources: FAQ_SOURCES.map((source) => ({
    id: source.id,
    kind: source.kind,
    authorSlots: source.authors.length,
    hasIdentifier: 'identifier' in source,
  })),
  productProvenance: FAQ_PRODUCT_PROVENANCE.map(({ id, repoPaths }) => ({
    id,
    repoPaths: [...repoPaths],
  })),
  guardrails: FAQ_GUARDRAILS.map((item) => ({
    id: item.id,
    state: item.state,
    label: item.label,
    sourceIds: [...item.sourceIds],
    provenanceIds: [...item.provenanceIds],
    questionIds: [...item.questionIds],
    review: {
      status: item.review.status,
      reviewerRole: item.review.reviewerRole,
    },
  })),
  assets: FAQ_ASSETS.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    publicPath: asset.publicPath,
    videoPath: 'videoPath' in asset ? asset.videoPath : undefined,
    width: asset.width,
    height: asset.height,
    provenance: asset.provenance,
    cropNote: asset.cropNote,
    approval: asset.approval,
    capturedOrReceivedOn: asset.capturedOrReceivedOn,
  })),
} as const
