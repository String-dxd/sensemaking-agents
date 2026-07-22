import { describe, expect, it } from 'vitest'
import type { MirrorEntryRow, VipsPageRow, VipsTimelineEntryRow } from '~/db/queries'
// @ts-expect-error internal JS engine modules are intentionally untyped.
import { mergeCapture } from '~/engine/student-space/Game/State/schema.js'
import {
  createStudentSpaceBackendSnapshot,
  mapTrajectoryResultToStudentSpaceCapture,
  mapVipsPagesToStudentSpaceProfile,
  mapWikiSnapshotToStudentSpaceReflections,
} from '~/lib/student-space/backend-snapshot'
import type { LoadVipsPagesResult } from '~/server/load-vips-pages.handler.server'

describe('Student Space backend snapshot mappers', () => {
  it('maps VIPS pages and timeline entries into engine profile facets', () => {
    const profile = mapVipsPagesToStudentSpaceProfile(
      vipsSnapshot({
        pages: [
          page('values', {
            compiled_truth: 'You keep coming back to contribution.',
            open_question: 'Where does that care want to land?',
            updated_at: '2026-05-14T08:00:00.000Z',
          }),
        ],
        timeline_by_dimension: {
          values: [
            timelineEntry(7, {
              canonical_claim_id: 'values.contribution',
              reflection_id: 24,
              verbatim_quote: 'I wanted the project to help someone.',
            }),
            timelineEntry(8, {
              forgotten_at: '2026-05-15T08:00:00.000Z',
              verbatim_quote: 'forgotten quote',
            }),
          ],
          interests: [],
          personality: [],
          skills: [],
        },
      }),
    )

    expect(profile.identity).toMatchObject({ name: 'Maya', className: 'Sec 3' })
    expect(profile.facets.values.paragraph).toBe('You keep coming back to contribution.')
    expect(profile.facets.values.openQuestion).toBe('Where does that care want to land?')
    expect(profile.facets.values.lastRefinedAt).toBe('2026-05-14T08:00:00.000Z')
    expect(profile.facets.values.quotes).toEqual([
      expect.objectContaining({
        id: 'timeline:7',
        text: 'I wanted the project to help someone.',
        canonicalClaimId: 'values.contribution',
        confidence: 'medium',
        sourceCaptureId: 'mirror:24',
        backendTimelineEntryId: 7,
        backendReflectionId: 24,
      }),
    ])
  })

  it('maps mirror entries into backend-backed ask captures with review state', () => {
    const reflections = mapWikiSnapshotToStudentSpaceReflections({
      entries: [
        mirrorEntry(25, { created_at: '2026-05-15T08:00:00.000Z' }),
        mirrorEntry(24, {
          created_at: '2026-05-14T08:00:00.000Z',
          review_status: 'confirmed',
          tags: ['mood:embarrassed'],
        }),
      ],
    })

    expect(reflections.map((entry) => entry.id)).toEqual(['mirror:24', 'mirror:25'])
    expect(reflections[0]).toMatchObject({
      backendMirrorEntryId: 24,
      reviewStatus: 'confirmed',
      syncStatus: 'synced',
      reframe: {
        headline: 'A moment can be rewritten.',
        highlightPhrase: 'You wanted more room to choose.',
        moods: ['embarrassment'],
      },
    })
  })

  it('maps latest Cartographer output into a trajectory capture', () => {
    const capture = mapTrajectoryResultToStudentSpaceCapture(
      {
        pending_diff_present: false,
        trajectory: {
          id: 9,
          student_id: 'demo',
          trajectory_text: 'A through-line about useful creative work.',
          pathways: [
            {
              label: 'Community design',
              trait_combination: [
                { claim_id: 'values.contribution', dimension: 'values', timeline_entry_id: 7 },
                { claim_id: 'skills.communication', dimension: 'skills', timeline_entry_id: 99 },
                { claim_id: 'interests.artistic', dimension: 'interests' },
              ],
              ecg_region_tags: ['cluster.social'],
              risks_tradeoffs: 'May need structure to stay sustainable.',
              exploration_prompt: 'Try a service-design project.',
            },
          ],
          open_questions: [],
          disclaimer: 'Draft, not destiny.',
          raw_output_json: '{}',
          created_at: '2026-05-16T08:00:00.000Z',
        },
      },
      {
        values: [
          timelineEntry(7, { canonical_claim_id: 'values.contribution', reflection_id: 42 }),
          // No reflection behind this entry — must not produce a link.
          timelineEntry(8, { reflection_id: null }),
        ],
        interests: [],
        personality: [],
        skills: [],
      },
    )

    expect(capture).toEqual(
      expect.objectContaining({
        id: 'cartographer:9',
        backendCartographerOutputId: 9,
        kind: 'trajectory',
        trajectory: {
          throughLine: 'A through-line about useful creative work.',
          bearings: [
            {
              id: 'cartographer:9:path:1',
              title: 'Community design',
              prompt: 'Try a service-design project.',
              traitTags: ['values.contribution', 'skills.communication', 'interests.artistic'],
              traitRefs: [
                // timeline_entry_id 7 resolves to reflection 42.
                { claimId: 'values.contribution', mirrorEntryId: 42 },
                // timeline_entry_id 99 is not in the timeline — no link.
                { claimId: 'skills.communication' },
                // No timeline_entry_id at all — no link.
                { claimId: 'interests.artistic' },
              ],
              ecgTags: ['cluster.social'],
              risk: 'May need structure to stay sustainable.',
            },
          ],
        },
      }),
    )
  })

  it('emits linkless traitRefs when no timeline is supplied (legacy call sites)', () => {
    const capture = mapTrajectoryResultToStudentSpaceCapture({
      pending_diff_present: false,
      trajectory: {
        id: 9,
        student_id: 'demo',
        trajectory_text: 'A through-line.',
        pathways: [
          {
            label: 'Community design',
            trait_combination: [
              { claim_id: 'values.contribution', dimension: 'values', timeline_entry_id: 7 },
            ],
            ecg_region_tags: [],
            risks_tradeoffs: '',
            exploration_prompt: '',
          },
        ],
        open_questions: [],
        disclaimer: '',
        raw_output_json: '{}',
        created_at: '2026-05-16T08:00:00.000Z',
      },
    })

    expect(capture?.trajectory.bearings[0]?.traitRefs).toEqual([{ claimId: 'values.contribution' }])
    expect(capture?.trajectory.bearings[0]?.traitTags).toEqual(['values.contribution'])
  })

  it('traitRefs survive the engine capture merge (schema.js allowlist)', () => {
    const merged = mergeCapture({
      id: 'cartographer:9',
      kind: 'trajectory',
      createdAt: '2026-05-16T08:00:00.000Z',
      trajectory: {
        throughLine: 'A through-line.',
        bearings: [
          {
            id: 'cartographer:9:path:1',
            title: 'Community design',
            prompt: 'Try a service-design project.',
            traitTags: ['values.contribution'],
            traitRefs: [
              { claimId: 'values.contribution', mirrorEntryId: 42 },
              { claimId: 'skills.communication' },
              // Malformed entries are dropped / stripped by the sanitizer.
              { claimId: 'interests.artistic', mirrorEntryId: -3 },
              { mirrorEntryId: 7 },
              'not-an-object',
            ],
            ecgTags: [],
            risk: '',
          },
        ],
      },
    }) as {
      trajectory: {
        bearings: Array<{ traitRefs: Array<{ claimId: string; mirrorEntryId?: number }> }>
      }
    } | null

    expect(merged?.trajectory.bearings[0]?.traitRefs).toEqual([
      { claimId: 'values.contribution', mirrorEntryId: 42 },
      { claimId: 'skills.communication' },
      { claimId: 'interests.artistic' },
    ])
  })

  it('combines profile, reflection, trajectory, and recent mood snapshots', () => {
    const snapshot = createStudentSpaceBackendSnapshot({
      vips: vipsSnapshot({
        recent_moods: [
          {
            id: 24,
            emotion: 'embarrassed',
            intensity: 0.72,
            created_at: '2026-05-14T08:00:00.000Z',
          },
        ],
      }),
      wiki: { entries: [mirrorEntry(24)] },
      trajectory: { trajectory: null, pending_diff_present: false },
    })

    expect(snapshot.profile.facets.values.quotes).toHaveLength(0)
    expect(snapshot.reflections).toHaveLength(1)
    expect(snapshot.trajectory).toBeNull()
    expect(snapshot.recentMoods).toEqual([
      expect.objectContaining({
        id: 'mood:24',
        emotion: 'embarrassment',
        intensity: 3,
        backendMirrorEntryId: 24,
      }),
    ])
    expect(snapshot.calendarEvents).toEqual([])
    expect(snapshot.teacherLetters).toEqual([])
  })

  it('maps centralized shell calendar and teacher-letter data into the engine snapshot', () => {
    const snapshot = createStudentSpaceBackendSnapshot({
      vips: vipsSnapshot({
        student_space_shell: {
          identity: { name: 'Maya', className: 'Sec 3', avatarDataUrl: null },
          calendarEvents: [
            {
              id: 'demo-shell:demo-a:school-checkpoint',
              label: 'Form teacher check-in',
              kind: 'class',
              date: '2025-10-14',
            },
          ],
          teacherLetters: [
            {
              id: 'demo-shell:demo-a:letter-pattern',
              from: 'Ms Tan',
              subject: 'A pattern worth keeping',
              body: 'Keep noticing the pattern.',
              sentAt: '2025-11-23T17:15:00Z',
              read: false,
            },
          ],
        },
      }),
      wiki: { entries: [] },
      trajectory: { trajectory: null, pending_diff_present: false },
    })

    expect(snapshot.profile.identity).toEqual({
      name: 'Maya',
      className: 'Sec 3',
      avatarDataUrl: null,
    })
    expect(snapshot.calendarEvents).toEqual([
      expect.objectContaining({ label: 'Form teacher check-in', date: '2025-10-14' }),
    ])
    expect(snapshot.teacherLetters).toEqual([
      expect.objectContaining({ from: 'Ms Tan', subject: 'A pattern worth keeping' }),
    ])
  })

  describe('identity hydration via authMenu fallback', () => {
    it('uses the seed student_profile name when present (auth label is ignored)', () => {
      const profile = mapVipsPagesToStudentSpaceProfile(
        vipsSnapshot({ student_profile: { name: 'Alice Tan', detail: 'Sec 3B' } }),
        {
          status: 'signed-in',
          label: 'Reza Ilmi',
          detail: 'reza@example.com',
          kind: 'workos',
        },
      )
      expect(profile.identity).toEqual({
        name: 'Alice Tan',
        className: 'Sec 3B',
        avatarDataUrl: null,
      })
    })

    it('uses authMenu.label + detail when student_profile is null and signed-in', () => {
      const profile = mapVipsPagesToStudentSpaceProfile(vipsSnapshot({ student_profile: null }), {
        status: 'signed-in',
        label: 'Reza Ilmi',
        detail: 'reza@example.com',
        kind: 'workos',
      })
      expect(profile.identity).toEqual({
        name: 'Reza Ilmi',
        className: 'reza@example.com',
        avatarDataUrl: null,
      })
    })

    it('coerces null detail to empty className when student_profile is null', () => {
      const profile = mapVipsPagesToStudentSpaceProfile(vipsSnapshot({ student_profile: null }), {
        status: 'signed-in',
        label: 'Reza Ilmi',
        detail: null,
        kind: 'workos',
      })
      expect(profile.identity).toEqual({
        name: 'Reza Ilmi',
        className: '',
        avatarDataUrl: null,
      })
    })

    it('falls back to "Me" when student_profile is null and authMenu is signed-out', () => {
      const profile = mapVipsPagesToStudentSpaceProfile(vipsSnapshot({ student_profile: null }), {
        status: 'signed-out',
      })
      expect(profile.identity).toEqual({ name: 'Me', className: '', avatarDataUrl: null })
    })

    it('falls back to "Me" when no authMenu is supplied', () => {
      const profile = mapVipsPagesToStudentSpaceProfile(vipsSnapshot({ student_profile: null }))
      expect(profile.identity).toEqual({ name: 'Me', className: '', avatarDataUrl: null })
    })

    it('falls back to "Me" when authMenu.label is whitespace-only', () => {
      const profile = mapVipsPagesToStudentSpaceProfile(vipsSnapshot({ student_profile: null }), {
        status: 'signed-in',
        label: '   ',
        detail: null,
        kind: 'workos',
      })
      expect(profile.identity).toEqual({ name: 'Me', className: '', avatarDataUrl: null })
    })

    it('surfaces a dev-bypass label when student_profile is null', () => {
      const profile = mapVipsPagesToStudentSpaceProfile(vipsSnapshot({ student_profile: null }), {
        status: 'signed-in',
        label: 'Dev bypass',
        detail: 'demo-a',
        kind: 'dev-bypass',
      })
      expect(profile.identity).toMatchObject({ name: 'Dev bypass', className: 'demo-a' })
    })
  })
})

function vipsSnapshot(overrides: Partial<LoadVipsPagesResult> = {}): LoadVipsPagesResult {
  return {
    student_profile: { name: 'Maya', detail: 'Sec 3' },
    pages: [page('values'), page('interests'), page('personality'), page('skills')],
    timeline_by_dimension: {
      values: [],
      interests: [],
      personality: [],
      skills: [],
    },
    recent_entries: [],
    recent_moods: [],
    world_mailbox: { unreadBriefCount: 0, lastBriefId: null },
    student_space_shell: null,
    claim_count_by_dimension: {
      values: 0,
      interests: 0,
      personality: 0,
      skills: 0,
    },
    total_claim_count: 0,
    ...overrides,
  }
}

function page(
  dimension: VipsPageRow['dimension'],
  overrides: Partial<VipsPageRow> = {},
): VipsPageRow {
  return {
    student_id: 'demo',
    dimension,
    compiled_truth: '',
    open_question: '',
    updated_at: null,
    ...overrides,
  }
}

function timelineEntry(
  id: number,
  overrides: Partial<VipsTimelineEntryRow> = {},
): VipsTimelineEntryRow {
  return {
    id,
    student_id: 'demo',
    dimension: 'values',
    canonical_claim_id: 'values.contribution',
    verbatim_quote: 'I wanted this to matter.',
    reflection_id: null,
    strength: 'medium',
    parallax_tag: ['school'],
    reinforces_id: null,
    forgotten_at: null,
    committed_at: '2026-05-14T08:00:00.000Z',
    ...overrides,
  }
}

function mirrorEntry(id: number, overrides: Partial<MirrorEntryRow> = {}): MirrorEntryRow {
  return {
    id,
    student_id: 'demo',
    transcript: 'I wanted more room to choose.',
    validation: 'That sounds like it mattered.',
    inferred_meaning: 'You wanted more room to choose.',
    story_reframe: 'A moment can be rewritten.',
    raw_output_json: '{}',
    context_type: 'school',
    review_status: 'pending',
    tags: [],
    created_at: '2026-05-14T08:00:00.000Z',
    ...overrides,
  }
}
