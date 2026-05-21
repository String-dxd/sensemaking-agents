import type { MirrorEntryRow } from '~/db/queries'

/**
 * Mock dataset preserved for component-level tests. Real loader is
 * `load-wiki.functions.ts`; this exists so component tests can render a
 * mirror entry without a server fn round-trip.
 */

export const MOCK_MIRROR_ENTRY: MirrorEntryRow = {
  id: 1,
  student_id: 'demo',
  transcript:
    'We had robotics today and Mr Lim brought in the new arm kit. I lost track of which screw went where halfway through and had to redo a section. The strange thing is it didn’t feel frustrating — I just kept going. We were there until 7pm and I didn’t notice.',
  validation:
    'You stayed with the disassembly long enough that the time disappeared. That’s worth marking — losing track of hours doesn’t happen by accident.',
  inferred_meaning:
    'Maybe the absorption was less about robotics specifically and more about being given a self-directed way in. The not-knowing was part of what kept you there.',
  story_reframe:
    'It’s the new arm kit and everyone else has two builds on you. You take one apart first — your way in. Halfway through you’ve lost which screw goes where and you redo a section without minding. Seven o’clock comes and you didn’t notice it pass.',
  raw_output_json: JSON.stringify({
    validation:
      'You stayed with the disassembly long enough that the time disappeared. That’s worth marking — losing track of hours doesn’t happen by accident.',
    inferred_meaning:
      'Maybe the absorption was less about robotics specifically and more about being given a self-directed way in. The not-knowing was part of what kept you there.',
    story_reframe:
      'It’s the new arm kit and everyone else has two builds on you. You take one apart first — your way in. Halfway through you’ve lost which screw goes where and you redo a section without minding. Seven o’clock comes and you didn’t notice it pass.',
  }),
  context_type: 'school',
  review_status: 'pending',
  tags: ['robotics', 'engineering', 'absorption'],
  created_at: new Date('2026-04-12T19:30:00').toISOString(),
}
