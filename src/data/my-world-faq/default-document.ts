import { FAQ_ASSETS } from './assets'
import { DEFAULT_MY_WORLD_FAQ_BUILD_STORY } from './build-story'
import {
  FAQ_LEDGER_PREVIEW_MANIFEST,
  FAQ_PRODUCT_STEP_MANIFEST,
  FAQ_SIGNAL_QUOTE_MANIFEST,
  MY_WORLD_FAQ_SCHEMA_VERSION,
  MY_WORLD_FAQ_V1_STRUCTURE_VERSION,
} from './content-manifest'
import type { MyWorldFaqEditorialDocument } from './content-schema'
import { FAQ_GUARDRAILS } from './guardrails'
import { DEFAULT_MY_WORLD_FAQ_POSTURE_STORY } from './posture-story'
import { FAQ_CONCERN_CLUSTERS, FAQ_QUESTIONS } from './questions'
import { FAQ_PRODUCT_PROVENANCE, FAQ_SOURCES } from './sources'
import { DEFAULT_MY_WORLD_FAQ_WHY_STORY } from './why-story'

const PRODUCT_COPY = {
  capture: {
    title: 'Capture',
    heading: 'Put a moment into words.',
    body: 'Text, voice, images and feelings offer different ways to begin.',
    boundary: 'This demo stops before Send. Nothing is submitted.',
  },
  identity: {
    title: 'My Identity',
    heading: 'Check the patterns taking shape.',
    body: 'Themes stay connected to the moments that produced them.',
    boundary: 'A pattern is a prompt to inspect, not a fixed label.',
  },
  history: {
    title: 'History',
    heading: 'Return to the original moment.',
    body: 'Students can revisit what they shared and how it was interpreted.',
    boundary: 'The interpretation remains traceable to student evidence.',
  },
  'path-finder': {
    title: 'Path Finder',
    heading: 'Explore a possible next direction.',
    body: 'Pathways are grounded in patterns across earlier reflections.',
    boundary: 'Evidence opens a possibility, not a prescription.',
  },
} as const

const PRODUCT_TRANSCRIPTS: Record<string, string> = {
  'product-01-capture':
    'The island opens Capture. Text mode is selected and a neutral demo reflection is typed. Send is never pressed.',
  'product-02-sensemake':
    'My Identity moves from Values to Interests, then filters the synthetic timeline to Investigative evidence.',
  'product-03-review':
    'History selects Saturday 25 July and opens the synthetic ECG Career Fair reflection with the original moment and Mirror notes.',
  'product-04-act-return':
    'Path Finder expands the first evidence set, opens its source CPR reflection, then returns to the pathway.',
}

const SIGNAL_COPY = {
  'dinner-table': {
    text: 'Are we replacing the dinner table conversation, not just adding a feature?',
    contextLabel: 'Anonymous event question',
  },
  'safe-home': {
    text: 'Not all students have a safe space at home to share with too.',
    contextLabel: 'Anonymous event comment',
  },
  'validate-demand': {
    text: 'How can we validate this is what students or teachers want?',
    contextLabel: 'Anonymous event question',
  },
  'screen-time': {
    text: 'Would this product add to screen time, given students already spend significant time on SLS?',
    contextLabel: 'Anonymous event question',
  },
  privacy: {
    text: 'Need very strong privacy guardrails in place before this can safely be released to students.',
    contextLabel: 'Anonymous event comment',
  },
} as const

const LEDGER_DESCRIPTIONS = {
  'built-today': 'Repository-verified behaviour, not proof of safety or efficacy.',
  'required-before-pilot': 'A deployment and governance condition, not future reassurance.',
  'still-researching':
    'An outcome the team does not know and evidence must be allowed to challenge.',
} as const

/**
 * The only complete compiled publication. The legacy registries are
 * compile-time seed inputs; renderers and future persistence consume this
 * versioned document (after validation/composition), never those fragments.
 */
export const DEFAULT_MY_WORLD_FAQ_DOCUMENT: MyWorldFaqEditorialDocument = {
  schemaVersion: MY_WORLD_FAQ_SCHEMA_VERSION,
  structureVersion: MY_WORLD_FAQ_V1_STRUCTURE_VERSION,
  route: {
    title: 'My World FAQ',
    description:
      'Learn what My World is, how the current prototype works, and how to share questions or feedback with the team.',
  },
  page: {
    hero: {
      eyebrow: 'Hello, DXD',
      heading: 'Here’s what My World is.',
      headingAccent: 'And how it works.',
      introduction:
        'This site documents the current prototype, answers questions we have heard, and gathers feedback to guide what we explore next.',
      productCta: 'See how it works',
      faqCta: 'Browse the FAQ',
    },
    product: {
      eyebrow: 'Product at a glance',
      heading: 'See how a reflection moves.',
      introduction: 'Four short journeys through the current desktop prototype.',
      footnote: 'Silent clips · synthetic demo data · captured 29 July 2026',
    },
    build: { ...DEFAULT_MY_WORLD_FAQ_BUILD_STORY },
    why: { ...DEFAULT_MY_WORLD_FAQ_WHY_STORY },
    posture: { ...DEFAULT_MY_WORLD_FAQ_POSTURE_STORY },
    signals: {
      eyebrow: 'Questions we heard',
      heading: 'Concern is part of the work.',
      introduction:
        'Anonymous event comments shaped this FAQ. They are signals, not survey results.',
    },
    ledger: {
      eyebrow: 'Guardrail ledger',
      heading: 'Keep the states separate.',
      introduction: 'What exists now, what a pilot would require, and what still needs evidence.',
    },
    faq: {
      eyebrow: 'FAQ',
      heading: 'Questions we are working through',
      introduction:
        'Scan the questions. Turn a card over for our short answer, or inspect the evidence behind it.',
    },
    contribution: {
      eyebrow: 'Build this with us',
      heading: 'Question it. Challenge it. Help us improve it.',
      body: 'We are listening before any pilot decision. Share a question, concern, suggestion or compliment without adding your name.',
    },
    footer: {
      brand: 'My World FAQ',
      sharing: 'Anyone with this link can open or forward it. Last reviewed 29 July 2026.',
    },
  },
  productSteps: FAQ_PRODUCT_STEP_MANIFEST.map((step) => ({
    ...step,
    ...PRODUCT_COPY[step.id],
  })),
  signalQuotes: FAQ_SIGNAL_QUOTE_MANIFEST.map((quote) => ({
    ...quote,
    ...SIGNAL_COPY[quote.id],
  })),
  ledgerPreview: FAQ_LEDGER_PREVIEW_MANIFEST.map((item) => ({
    ...item,
    description: LEDGER_DESCRIPTIONS[item.state],
  })),
  concernClusters: FAQ_CONCERN_CLUSTERS.map((cluster) => ({ ...cluster })),
  questions: FAQ_QUESTIONS.map((question) => ({
    ...question,
    displayedQuestion: question.committedQuestions[0] ?? question.title,
    committedQuestions: [...question.committedQuestions],
    searchAliases: [...question.searchAliases],
    blocks: question.blocks.map((block) => ({
      ...block,
      sourceIds: [...block.sourceIds],
      provenanceIds: [...block.provenanceIds],
      guardrailIds: [...block.guardrailIds],
      review: { ...block.review },
    })),
    guardrailIds: [...question.guardrailIds],
    assetIds: [...question.assetIds],
    review: { ...question.review },
  })),
  sources: FAQ_SOURCES.map((source) => ({
    ...source,
    authors: [...source.authors],
  })),
  productProvenance: FAQ_PRODUCT_PROVENANCE.map((item) => ({
    ...item,
    repoPaths: [...item.repoPaths],
  })),
  guardrails: FAQ_GUARDRAILS.map((item) => ({
    ...item,
    sourceIds: [...item.sourceIds],
    provenanceIds: [...item.provenanceIds],
    questionIds: [...item.questionIds],
    review: { ...item.review },
  })),
  assets: FAQ_ASSETS.map((asset) => ({
    ...asset,
    transcript: PRODUCT_TRANSCRIPTS[asset.id] ?? asset.transcript,
  })),
}
