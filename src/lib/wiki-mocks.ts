import type { ConnectorOutputRow, MirrorEntryRow, PathfinderOutputRow } from '~/db/queries'

/**
 * U3 mock dataset — replaced in U9 with `load-wiki.functions.ts` reading
 * from sqlite. Shape mirrors the real DB row types so the swap is purely
 * the data source.
 */

export const MOCK_MIRROR_ENTRY: MirrorEntryRow = {
  id: 1,
  student_id: 'demo',
  summary:
    'First time tearing down the robotics arm at club. Lost track of which screw went where, but felt absorbed for hours.',
  transcript:
    'We had robotics today and Mr Lim brought in the new arm kit. I lost track of which screw went where halfway through and had to redo a section. The strange thing is it didn’t feel frustrating — I just kept going. We were there until 7pm and I didn’t notice.',
  signals: [
    { kind: 'observed', text: 'Lost track of time during a hands-on engineering task.' },
    {
      kind: 'observed',
      text: 'Chose disassembly-first as a self-directed way in, rather than copying others.',
    },
    {
      kind: 'uncertain',
      text: 'Whether the absorption was about the task or about the social cover of robotics club.',
    },
  ],
  caution: 'One session. Could be novelty.',
  tags: ['robotics', 'engineering', 'absorption'],
  created_at: new Date('2026-04-12T19:30:00').toISOString(),
}

export const MOCK_CONNECTOR_OUTPUT: ConnectorOutputRow = {
  id: 1,
  student_id: 'demo',
  patterns: [
    {
      text: 'Spatial-positional reasoning recurs across hands-on assembly and the geometric-reasoning gap on maths tests.',
      strength: 'medium',
      evidence_reflection_ids: [1, 2, 6],
    },
    {
      text: 'Sustained attention is tied more to format (hands-on, single-thesis) than to subject (engineering vs. lit).',
      strength: 'low',
      evidence_reflection_ids: [3, 5],
    },
  ],
  still_unclear:
    'Is the pull toward mechatronics about the topic, or about hands-on format that any applied corner would offer?',
  created_at: new Date('2026-05-02T03:14:00').toISOString(),
}

export const MOCK_PATHFINDER_OUTPUT: PathfinderOutputRow = {
  id: 1,
  student_id: 'demo',
  trajectory:
    'A drift toward applied, hands-on engineering with the door to humanities-leaning argument still ajar — the two are not yet in conflict.',
  pathways: [
    {
      label: 'Mechatronics-leaning engineering',
      reasoning:
        'Reflections #1 and #6 cluster around hands-on assembly, and #7 (open-house engagement) reinforces a curiosity centered on actuators rather than infrastructure.',
      ecg_taxonomy_ids: ['cluster.engineering', 'pathway.uni-sutd', 'cca.robotics'],
    },
    {
      label: 'Mixed JC subject combination keeping Lit at H2 alongside science',
      reasoning:
        'Reflections #3, #5, and #8 surface sustained engagement in literary argument that the PCME plan would close off. A mixed combination keeps both pathways open without committing either way.',
      ecg_taxonomy_ids: ['subject.h2-bio-art', 'subject.h1-art'],
    },
    {
      label: 'Polytechnic engineering with later articulation',
      reasoning:
        'If the absorption signal in #1 and #6 is about hands-on format more than subject, polytechnic engineering would let that signal drive practice earlier than JC would.',
      ecg_taxonomy_ids: ['pathway.poly', 'cluster.engineering'],
    },
  ],
  disclaimer:
    'These are paths the pattern points toward, not careers to choose. Treat them as hypotheses to test.',
  connector_output_id: MOCK_CONNECTOR_OUTPUT.id,
  created_at: new Date('2026-05-02T03:14:30').toISOString(),
}

export const MOCK_WIKI = {
  entries: [MOCK_MIRROR_ENTRY],
  connector: MOCK_CONNECTOR_OUTPUT,
  pathfinder: MOCK_PATHFINDER_OUTPUT,
}

export type WikiData = typeof MOCK_WIKI

const fakeStore: WikiData = JSON.parse(JSON.stringify(MOCK_WIKI)) as WikiData

/** Mock wiki loader — U9 replaces with a real server fn. */
export async function loadMockWiki(): Promise<WikiData> {
  await new Promise((r) => setTimeout(r, 0))
  return fakeStore
}

/** Mock entry loader — U9 replaces. */
export async function loadMockEntry(entryId: number): Promise<{
  entry: MirrorEntryRow
  connector: ConnectorOutputRow
  pathfinder: PathfinderOutputRow
} | null> {
  await new Promise((r) => setTimeout(r, 0))
  if (fakeStore.entries[0]?.id !== entryId) return null
  return {
    entry: fakeStore.entries[0],
    connector: fakeStore.connector,
    pathfinder: fakeStore.pathfinder,
  }
}

export interface MockEditCautionInput {
  entryId: number
  caution: string
}

/** Mock edit-and-confirm — U9 replaces with a real edit-wiki server fn. */
export async function mockEditCaution(input: MockEditCautionInput): Promise<MirrorEntryRow> {
  await new Promise((r) => setTimeout(r, 0))
  const entry = fakeStore.entries.find((e) => e.id === input.entryId)
  if (!entry) throw new Error(`mock entry ${input.entryId} not found`)
  entry.caution = input.caution
  return entry
}

/** Reset the mock store between tests. */
export function _resetWikiMockStore(): void {
  Object.assign(fakeStore, JSON.parse(JSON.stringify(MOCK_WIKI)) as WikiData)
}
