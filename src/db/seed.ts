import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Database as DatabaseInstance } from 'better-sqlite3'
import { VIPS_DIMENSIONS } from '~/data/vips-taxonomy'
import { openDb } from './client'
import { upsertVipsPage } from './queries'

/**
 * v0.2 seed loader (U13). The v0.1 single-student × 8-reflection seed was
 * replaced by the multi-student fixture at
 * `test/ablation/fixtures/seed-multistudent.json`. The v0.1 fixture is
 * archived under `test/ablation/fixtures/_archive/` for cross-version
 * comparison of ablation reports.
 *
 * Shape: a top-level `students` array; each student carries a hand-curated
 * `profile` (used as reviewer-facing context, not persisted) plus a flat list
 * of `reflections`, each tagged with one of the closed `context_type` values
 * enforced by the `mirror_entries.context_type` CHECK (U1).
 *
 * Per-row insert uses raw SQL rather than `insertMirrorEntry` so we can set
 * `context_type` explicitly — `insertMirrorEntry` is still U7's surface area
 * during the parallel pivot and doesn't yet expose the column.
 *
 * Empty VIPS pages are pre-created per student × 4 dimensions
 * (`values`/`interests`/`personality`/`skills`), initialized with
 * `compiled_truth=""` and `open_question=""`. The auto-Connector populates
 * them on the first live Mirror session post-seed (U7's surface) — the seed
 * does not hand-design `vips_timeline_entries`.
 */

export type SeedContextType = 'school' | 'family' | 'peer' | 'hobby' | 'civic'

export interface SeedReflectionFixture {
  context_type: SeedContextType
  transcript: string
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

/**
 * Idempotent seed loader. For each student in the multi-student fixture:
 *   - If the student already has rows in `mirror_entries`, that student is a
 *     no-op (so partial state is preserved and `pnpm seed` is rerunnable).
 *   - Otherwise, insert one `mirror_entries` row per reflection (with explicit
 *     `context_type`) and one empty `vips_pages` row per (student, dimension).
 *
 * To rebuild from scratch: delete `app.db` (or bump `SCHEMA_VERSION` so the
 * client drops it on next boot).
 */
export function seed(opts: { db?: DatabaseInstance } = {}): {
  inserted: number
  studentsSeeded: string[]
  studentsSkipped: string[]
  skipped: boolean
} {
  const db = opts.db ?? openDb()
  const corpus = loadSeedCorpus()

  let inserted = 0
  const studentsSeeded: string[] = []
  const studentsSkipped: string[] = []

  for (const student of corpus.students) {
    const existing = db
      .prepare('SELECT COUNT(*) AS c FROM mirror_entries WHERE student_id = ?')
      .get(student.student_id) as { c: number }
    if (existing.c > 0) {
      studentsSkipped.push(student.student_id)
      continue
    }

    db.transaction(() => {
      for (const r of student.reflections) {
        // Mirror agent output fields are intentionally left empty: the v0.2
        // seed represents the raw transcript surface only; the auto-Connector
        // chain (U7) populates `vips_proposed_diffs` / VIPS pages live. The
        // ablation runner formats reflections from `story_reframe` when
        // present, so we mirror the transcript there as a graceful fallback
        // for the cross-student combined-corpus run until U7's persist-mirror
        // reshape wires the live Mirror output back into the seed harness.
        const rawOutput = JSON.stringify({
          validation: '',
          inferred_meaning: '',
          story_reframe: r.transcript,
        })
        db.prepare(
          `INSERT INTO mirror_entries
             (student_id, transcript, validation, inferred_meaning, story_reframe,
              raw_output_json, context_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          student.student_id,
          r.transcript,
          '',
          '',
          r.transcript,
          rawOutput,
          r.context_type,
          r.created_at,
        )
        inserted++
      }

      // Empty VIPS pages — the auto-Connector populates these on the first
      // live Mirror session per U7's plan.
      for (const dimension of VIPS_DIMENSIONS) {
        upsertVipsPage(
          student.student_id,
          { dimension, compiled_truth: '', open_question: '' },
          { ctx: { db } },
        )
      }
    })()

    studentsSeeded.push(student.student_id)
  }

  return {
    inserted,
    studentsSeeded,
    studentsSkipped,
    skipped: studentsSeeded.length === 0,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = seed()
  if (result.skipped) {
    console.log(
      `seed: skipped — all ${result.studentsSkipped.length} student(s) already populated (${result.studentsSkipped.join(', ')})`,
    )
  } else {
    console.log(
      `seed: inserted ${result.inserted} reflection(s) across ${result.studentsSeeded.length} student(s): ${result.studentsSeeded.join(', ')}`,
    )
    if (result.studentsSkipped.length > 0) {
      console.log(
        `seed: skipped ${result.studentsSkipped.length}: ${result.studentsSkipped.join(', ')}`,
      )
    }
  }
}
