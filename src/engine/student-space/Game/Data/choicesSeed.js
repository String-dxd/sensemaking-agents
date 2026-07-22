/**
 * Seed for the Choices profile tab — demo data grounded in the Alice demo
 * corpus (test/ablation/fixtures/seed-multistudent.json + the MyWorld demo
 * transcripts). Read-only starting point; the student can add/remove.
 *
 * Applied by Choices.hydrate() only when there is no persisted snapshot
 * (fresh demo). Once the student edits, their persisted list wins.
 *
 * Shapes: see Choices.d.ts.
 *   decisions  — decision log (options, chose, forces, patternTag)
 *   intentions — forward-looking change intentions (current → change)
 *   forces enum:  consequential | peer-acceptance | values | family | gut | other
 *   patternTag:   avoidant | impulsive | deliberate | null
 */

export const CHOICES_SEED = {
    decisions: [
        {
            id:        'dec_seed_stjohn',
            createdAt: '2026-01-10T09:00:00.000Z',
            decision:  'Which CCA to join in Sec 1',
            options:   ['St John Ambulance Brigade', 'A sports CCA', 'Nothing in particular'],
            chose:     'St John Ambulance Brigade',
            forces:    ['family'],
            when:      'Start of Sec 1',
            note:      "Parents suggested it. Didn't expect the first-aid side to be the part that stuck.",
            patternTag: null,
        },
        {
            id:        'dec_seed_walkathon',
            createdAt: '2026-02-05T10:00:00.000Z',
            decision:  'Whether to help organise the national Walkathon',
            options:   ['Say no, too much admin', 'Help organise it'],
            chose:     'Helped organise it',
            forces:    ['values'],
            when:      'February',
            note:      'Reluctant at first; the cross-school coordination turned out to be real problem-solving.',
            patternTag: 'deliberate',
        },
        {
            id:        'dec_seed_ncoc',
            createdAt: '2026-03-25T11:00:00.000Z',
            decision:  'Whether to sign up for the Zone NCOC leadership course',
            options:   ['Sign up for NCOC', 'Sit this one out'],
            chose:     'Still deciding — leaning on whether Jaya signs up',
            forces:    ['peer-acceptance'],
            when:      'This term',
            note:      "The leadership pull is real; the discipline-heavy side isn't. Right now it hinges on Jaya.",
            patternTag: 'avoidant',
        },
        {
            id:        'dec_seed_subjectcombo',
            createdAt: '2026-07-22T08:05:00.000Z',
            decision:  'JC or Poly, and which subject combination',
            options:   ['JC — keep options open', 'Poly — more hands-on'],
            chose:     'Leaning Poly, sports science / rehab (JC not fully ruled out)',
            forces:    ['values'],
            when:      'September deadline',
            note:      "Traced the 'oh that's why' feeling from physics and the physio's talk — hands-on fits me.",
            patternTag: 'deliberate',
        },
    ],
    intentions: [
        {
            id:        'int_seed_ncoc',
            createdAt: '2026-07-22T08:10:00.000Z',
            current:   'I let a friend’s choice decide mine — NCOC is waiting on whether Jaya goes.',
            change:    'Decide NCOC with a reason that still stands even if she says no.',
            byWhen:    'Before sign-ups close',
            linkedPatternTag: 'avoidant',
        },
        {
            id:        'int_seed_badge',
            createdAt: '2026-07-22T08:12:00.000Z',
            current:   'One bad assessment day — the freeze under the examiner — shook my confidence.',
            change:    'Re-attempt the first-aid badge and rehearse the distressed-casualty scenario so it does not repeat.',
            byWhen:    'Next year',
            linkedPatternTag: null,
        },
        {
            id:        'int_seed_poly',
            createdAt: '2026-07-22T08:14:00.000Z',
            current:   "I've only imagined poly courses from the outside.",
            change:    'Actually talk to someone in a sports-science / rehab course — maybe the physio from the career fair.',
            byWhen:    'These holidays',
            linkedPatternTag: 'deliberate',
        },
    ],
}
