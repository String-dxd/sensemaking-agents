// Multi-student fixture loader. Seeds the v0.2 demo corpus into Neon via the
// `withStudent` RLS envelope (see src/db/client.ts).
//
// Idempotency: per-student by default. If a student already has any
// `mirror_entries` rows, that student is skipped — re-running after a partial
// seed only fills in the missing students. Set SEED_REPLACE_EXISTING=1 to reset
// the selected seed students before inserting the fixture.
//
// tsvector columns (`story_reframe_tsv`, `verbatim_quote_tsv`) are GENERATED
// ALWAYS AS in the schema, so they populate automatically on INSERT — no
// SQLite-FTS5 → Postgres translation step is needed in the seed itself.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import type { Mood, VipsClaimStrength, VipsContextType } from '~/agents/tools/schemas'
import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'
import { mirrorMoodTag } from '~/server/mood-tags'
import { type TenantContext, withStudent } from './client'
import { type CartographerPathway, insertCartographerOutput, upsertVipsPage } from './queries'
import {
  agentTraces,
  cartographerOutputs,
  connectorOutputs,
  memorySnapshots,
  mirrorEntries,
  mirrorEntryTags,
  pathfinderOutputs,
  studentMemoryFiles,
  tags,
  vipsForgetCount,
  vipsPages,
  vipsProposedDiffs,
  vipsTimelineEntries,
} from './schema'

export type SeedMirrorReviewStatus = 'pending' | 'confirmed' | 'forgotten'

const MIRROR_CONFIRMED_TAG = 'system:mirror-confirmed'
const MIRROR_FORGOTTEN_TAG = 'system:mirror-forgotten'

export interface SeedReflectionFixture {
  context_type: VipsContextType
  transcript: string
  validation?: string
  inferred_meaning?: string
  story_reframe?: string
  review_status?: SeedMirrorReviewStatus
  mood?: Mood
  created_at: string
}

export interface SeedStudentProfile {
  name_handle: string
  year_level: string
  school_type: 'IP' | 'JC' | 'sec' | 'poly'
  values_dominance: string[]
  riasec_tilt: string[]
  skills_evident: string[]
  notes_for_review: string
}

export interface SeedStudent {
  student_id: string
  profile: SeedStudentProfile
  /** Free-form coverage matrix the reviewer fills in by hand (AE6 audit aid). */
  coverage_matrix: string
  reflections: SeedReflectionFixture[]
  vips_pages?: SeedVipsPageFixture[]
  vips_timeline_entries?: SeedVipsTimelineEntryFixture[]
  trajectory?: SeedTrajectoryFixture
}

export interface SeedVipsPageFixture {
  dimension: VipsDimension
  compiled_truth: string
  open_question: string
}

export interface SeedVipsTimelineEntryFixture {
  key?: string
  dimension: VipsDimension
  canonical_claim_id: string
  verbatim_quote: string
  /** 1-based index into this student's reflections array. */
  reflection_index?: number
  strength: VipsClaimStrength
  parallax_tag: VipsContextType[]
  committed_at?: string
}

export interface SeedTrajectoryClaimRefFixture {
  claim_id: string
  dimension: VipsDimension
  /** Optional key from `vips_timeline_entries` for a clickable source chip. */
  timeline_key?: string
}

export interface SeedTrajectoryPathwayFixture {
  label: string
  trait_combination: SeedTrajectoryClaimRefFixture[]
  ecg_region_tags: string[]
  risks_tradeoffs: string
  exploration_prompt: string
}

export interface SeedTrajectoryFixture {
  trajectory_text: string
  pathways: SeedTrajectoryPathwayFixture[]
  open_questions: string[]
  disclaimer: string
}

export interface MultiStudentSeedCorpus {
  description: string
  students: SeedStudent[]
}

const SEED_PATH = resolve(process.cwd(), 'test/ablation/fixtures/seed-multistudent.json')

export function loadSeedCorpus(): MultiStudentSeedCorpus {
  const raw = readFileSync(SEED_PATH, 'utf8')
  return JSON.parse(raw) as MultiStudentSeedCorpus
}

export interface SeedResult {
  inserted: number
  timelineEntriesInserted: number
  trajectoryRowsInserted: number
  studentsSeeded: string[]
  studentsReplaced: string[]
  studentsSkipped: string[]
  skipped: boolean
}

/**
 * Seed the multi-student fixture into Neon. Per-student idempotent: if
 * `mirror_entries` already has rows for a given student, that student is
 * skipped. VIPS pages are created on first seed; curated fixture pages are
 * written when present, and empty rows are kept as the fallback.
 *
 * Reflections insert with explicit `created_at` from the fixture (the v0.2
 * ablation harness sorts by this column, so it must match the curated
 * timeline).
 */
export async function seed(): Promise<SeedResult> {
  const corpus = loadSeedCorpus()
  const selectedStudentIds = parseSelectedStudentIds()
  const replaceExisting = isTruthy(process.env.SEED_REPLACE_EXISTING)

  let inserted = 0
  let timelineEntriesInserted = 0
  let trajectoryRowsInserted = 0
  const studentsSeeded: string[] = []
  const studentsReplaced: string[] = []
  const studentsSkipped: string[] = []

  for (const student of corpus.students) {
    if (selectedStudentIds && !selectedStudentIds.has(student.student_id)) continue

    const result = await withStudent(student.student_id, async (ctx) => {
      // Explicit student_id scoping: the seed runs as a DB role with
      // BYPASSRLS (Neon's `neondb_owner`), so the RLS policy that would
      // normally scope `from mirror_entries` to `app.student_id` is
      // skipped. Filtering inline keeps the seed correct under both
      // RLS-enforced and RLS-bypass roles.
      const existing = await ctx.db.execute<{ c: number }>(
        sql`select count(*)::int as c from ${mirrorEntries} where ${mirrorEntries.studentId} = ${student.student_id}`,
      )
      if ((existing.rows[0]?.c ?? 0) > 0) {
        if (!replaceExisting) {
          return { skipped: true, replaced: false, inserted: 0, timelineInserted: 0, trajectory: 0 }
        }
        await resetSeedStudent(ctx.db, student.student_id)
      }

      let count = 0
      const reflectionIds: number[] = []
      for (const r of student.reflections) {
        const validation = r.validation ?? ''
        const inferredMeaning = r.inferred_meaning ?? ''
        const storyReframe = r.story_reframe ?? r.transcript
        const rawOutput = JSON.stringify({
          validation,
          inferred_meaning: inferredMeaning,
          story_reframe: storyReframe,
        })
        const insertedRows = await ctx.db
          .insert(mirrorEntries)
          .values({
            studentId: student.student_id,
            transcript: r.transcript,
            validation,
            inferredMeaning,
            storyReframe,
            rawOutputJson: rawOutput,
            contextType: r.context_type,
            createdAt: r.created_at,
          })
          .returning({ id: mirrorEntries.id })
        const reflectionId = insertedRows[0]?.id
        if (reflectionId === undefined) throw new Error('seed: inserted mirror row missing id')
        reflectionIds.push(reflectionId)
        await applyMirrorReviewStatus(ctx.db, student.student_id, reflectionId, r.review_status)
        if (r.mood) {
          await attachMirrorTag(ctx.db, student.student_id, reflectionId, mirrorMoodTag(r.mood))
        }
        count++
      }

      // Reuse `upsertVipsPage` so the row shape stays consistent with the
      // production write path. Students without curated pages still get empty
      // rows so the UI remains uniform.
      const seededPages = new Map((student.vips_pages ?? []).map((page) => [page.dimension, page]))
      for (const dimension of VIPS_DIMENSIONS) {
        const page = seededPages.get(dimension)
        await upsertVipsPage(
          student.student_id,
          {
            dimension,
            compiled_truth: page?.compiled_truth ?? '',
            open_question: page?.open_question ?? '',
          },
          { ctx },
        )
      }

      const timelineKeyToId = new Map<string, number>()
      let timelineInserted = 0
      for (const entry of student.vips_timeline_entries ?? []) {
        const reflectionId =
          entry.reflection_index === undefined
            ? null
            : (reflectionIds[entry.reflection_index - 1] ?? null)
        const insertedTimelineRows = await ctx.db
          .insert(vipsTimelineEntries)
          .values({
            studentId: student.student_id,
            dimension: entry.dimension,
            canonicalClaimId: entry.canonical_claim_id,
            verbatimQuote: entry.verbatim_quote,
            reflectionId,
            strength: entry.strength,
            parallaxTagJson: JSON.stringify(entry.parallax_tag),
            committedAt: entry.committed_at ?? new Date().toISOString(),
          })
          .returning({ id: vipsTimelineEntries.id })
        const timelineId = insertedTimelineRows[0]?.id
        if (timelineId === undefined) throw new Error('seed: inserted timeline row missing id')
        if (entry.key) timelineKeyToId.set(entry.key, timelineId)
        timelineInserted++
      }

      let trajectory = 0
      if (student.trajectory) {
        const pathways = resolveTrajectoryPathways(student.trajectory.pathways, timelineKeyToId)
        await insertCartographerOutput(
          student.student_id,
          {
            trajectory_text: student.trajectory.trajectory_text,
            pathways,
            open_questions: student.trajectory.open_questions,
            disclaimer: student.trajectory.disclaimer,
            raw_output: {
              trajectory_paragraph: student.trajectory.trajectory_text,
              pathways,
              open_questions: student.trajectory.open_questions,
              disclaimer: student.trajectory.disclaimer,
              source: 'test/ablation/fixtures/seed-multistudent.json',
            },
          },
          { ctx },
        )
        trajectory = 1
      }

      return {
        skipped: false,
        replaced: (existing.rows[0]?.c ?? 0) > 0,
        inserted: count,
        timelineInserted,
        trajectory,
      }
    })

    if (result.skipped) {
      studentsSkipped.push(student.student_id)
    } else {
      studentsSeeded.push(student.student_id)
      if (result.replaced) studentsReplaced.push(student.student_id)
      inserted += result.inserted
      timelineEntriesInserted += result.timelineInserted
      trajectoryRowsInserted += result.trajectory
    }
  }

  return {
    inserted,
    timelineEntriesInserted,
    trajectoryRowsInserted,
    studentsSeeded,
    studentsReplaced,
    studentsSkipped,
    skipped: studentsSeeded.length === 0,
  }
}

function parseSelectedStudentIds(): Set<string> | null {
  const raw = process.env.SEED_STUDENT_IDS?.trim()
  if (!raw) return null
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  return ids.length > 0 ? new Set(ids) : null
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase())
}

type SeedTransaction = TenantContext['db']

async function resetSeedStudent(db: SeedTransaction, studentId: string): Promise<void> {
  // Each delete is explicitly scoped by student_id. The seed CLI typically
  // runs as `neondb_owner` (BYPASSRLS), so relying on the RLS policy to
  // scope these deletes would silently wipe every student's rows on each
  // iteration; tenancy-bound DELETEs are correct under both RLS-enforced
  // and RLS-bypass roles.
  await db.delete(agentTraces).where(eq(agentTraces.studentId, studentId))
  await db.delete(cartographerOutputs).where(eq(cartographerOutputs.studentId, studentId))
  await db.delete(pathfinderOutputs).where(eq(pathfinderOutputs.studentId, studentId))
  await db.delete(connectorOutputs).where(eq(connectorOutputs.studentId, studentId))
  await db.delete(vipsProposedDiffs).where(eq(vipsProposedDiffs.studentId, studentId))
  await db.delete(vipsTimelineEntries).where(eq(vipsTimelineEntries.studentId, studentId))
  await db.delete(vipsPages).where(eq(vipsPages.studentId, studentId))
  await db.delete(vipsForgetCount).where(eq(vipsForgetCount.studentId, studentId))
  await db.delete(memorySnapshots).where(eq(memorySnapshots.studentId, studentId))
  await db.delete(studentMemoryFiles).where(eq(studentMemoryFiles.studentId, studentId))
  await db.delete(mirrorEntries).where(eq(mirrorEntries.studentId, studentId))
  await db.delete(tags).where(eq(tags.studentId, studentId))
}

async function applyMirrorReviewStatus(
  db: SeedTransaction,
  studentId: string,
  entryId: number,
  status: SeedMirrorReviewStatus | undefined,
): Promise<void> {
  const label =
    status === 'confirmed'
      ? MIRROR_CONFIRMED_TAG
      : status === 'forgotten'
        ? MIRROR_FORGOTTEN_TAG
        : null
  if (!label) return

  await attachMirrorTag(db, studentId, entryId, label)
}

async function attachMirrorTag(
  db: SeedTransaction,
  studentId: string,
  entryId: number,
  label: string,
): Promise<void> {
  // The seed role has BYPASSRLS, so the lookup must scope by student
  // explicitly — `tags` labels are unique per student, and reusing another
  // student's tag row would link this entry to a tag its reader can't see.
  const byStudentAndLabel = sql`${tags.studentId} = ${studentId} and ${tags.label} = ${label}`
  const existing = await db.select({ id: tags.id }).from(tags).where(byStudentAndLabel)
  let tagId = existing[0]?.id
  if (tagId === undefined) {
    const inserted = await db
      .insert(tags)
      .values({ studentId, label })
      .onConflictDoNothing()
      .returning({ id: tags.id })
    tagId =
      inserted[0]?.id ??
      (await db.select({ id: tags.id }).from(tags).where(byStudentAndLabel))[0]?.id
  }
  if (tagId === undefined) throw new Error(`seed: could not upsert tag ${label}`)

  await db.insert(mirrorEntryTags).values({ entryId, tagId }).onConflictDoNothing()
}

function resolveTrajectoryPathways(
  pathways: SeedTrajectoryPathwayFixture[],
  timelineKeyToId: Map<string, number>,
): CartographerPathway[] {
  return pathways.map((pathway) => ({
    label: pathway.label,
    trait_combination: pathway.trait_combination.map((claim) => {
      const resolved: CartographerPathway['trait_combination'][number] = {
        claim_id: claim.claim_id,
        dimension: claim.dimension,
      }
      const timelineId = claim.timeline_key ? timelineKeyToId.get(claim.timeline_key) : undefined
      if (timelineId !== undefined) resolved.timeline_entry_id = timelineId
      return resolved
    }),
    ecg_region_tags: pathway.ecg_region_tags,
    risks_tradeoffs: pathway.risks_tradeoffs,
    exploration_prompt: pathway.exploration_prompt,
  }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await import('dotenv/config')
  const result = await seed()
  if (result.skipped) {
    console.log(
      `seed: skipped — all ${result.studentsSkipped.length} student(s) already populated (${result.studentsSkipped.join(', ')})`,
    )
  } else {
    console.log(
      `seed: inserted ${result.inserted} reflection(s), ${result.timelineEntriesInserted} timeline entry row(s), and ${result.trajectoryRowsInserted} trajectory row(s) across ${result.studentsSeeded.length} student(s): ${result.studentsSeeded.join(', ')}`,
    )
    if (result.studentsReplaced.length > 0) {
      console.log(`seed: replaced existing data for ${result.studentsReplaced.join(', ')}`)
    }
    if (result.studentsSkipped.length > 0) {
      console.log(
        `seed: skipped ${result.studentsSkipped.length}: ${result.studentsSkipped.join(', ')}`,
      )
    }
  }
}
