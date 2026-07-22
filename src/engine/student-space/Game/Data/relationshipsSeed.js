/**
 * Seed for the Relationships profile tab — demo data grounded in the Alice
 * demo corpus (test/ablation/fixtures/seed-multistudent.json + the MyWorld
 * demo transcripts). Read-only starting point; the student can add/remove.
 *
 * Applied by Relationships.hydrate() only when there is no persisted
 * snapshot (fresh demo). Once the student edits, their persisted list wins.
 *
 * Shapes: see Relationships.d.ts.
 *   map          — who is in my life        (category, quality)
 *   belonging    — where I belong vs. take part (groupKind, belongLevel)
 *   perspectives — how others see me         (source, agreementSelf)
 */

export const RELATIONSHIPS_SEED = {
    map: [
        {
            id:        'rel_seed_grandfather',
            createdAt: '2026-02-03T09:10:00.000Z',
            name:      'My grandfather (ah gong)',
            category:  'family',
            quality:   'give-to',
            note:      "His heart isn't strong — being able to help him is why the CPR training actually matters to me.",
        },
        {
            id:        'rel_seed_mum',
            createdAt: '2026-02-03T09:12:00.000Z',
            name:      'My mum',
            category:  'family',
            quality:   'mutual',
            note:      'Does catering work, and worries about ah gong. She notices things.',
        },
        {
            id:        'rel_seed_jaya',
            createdAt: '2026-03-24T11:05:00.000Z',
            name:      'Jaya',
            category:  'cca',
            quality:   'mutual',
            note:      'Same CCA. Whether she signs up for NCOC is quietly deciding it for me.',
        },
        {
            id:        'rel_seed_joseph',
            createdAt: '2026-04-15T08:35:00.000Z',
            name:      'Joseph',
            category:  'close-friend',
            quality:   'mutual',
            note:      'Twisted his ankle at camp. Made me notice the gap between CPR and sports-injury first aid.',
        },
        {
            id:        'rel_seed_mslim',
            createdAt: '2026-07-09T11:35:00.000Z',
            name:      'Ms Lim',
            category:  'teacher',
            quality:   'rely-on',
            note:      "Physics teacher. Her real-world demos are where the 'oh that's why' feeling started.",
        },
        {
            id:        'rel_seed_mrlim',
            createdAt: '2026-06-02T07:50:00.000Z',
            name:      'Mr Lim',
            category:  'teacher',
            quality:   'rely-on',
            note:      'Form teacher. Instead of confiscating the Beyblades, he suggested turning them into a project.',
        },
        {
            id:        'rel_seed_walkathon',
            createdAt: '2026-04-08T10:05:00.000Z',
            name:      'The student from the walkathon',
            category:  'other',
            quality:   'uncertain',
            note:      'From another school, met planning hydration points. Organised, dry humour, actually listens.',
        },
    ],
    belonging: [
        {
            id:         'belong_seed_stjohn',
            createdAt:  '2026-02-03T09:15:00.000Z',
            groupKind:  'cca',
            groupName:  'St John Ambulance Brigade',
            belongLevel:'belong',
            note:       'The first aid and CPR side gives it purpose; the foot drills still feel like just turning up.',
        },
        {
            id:         'belong_seed_walkathon',
            createdAt:  '2026-04-08T10:10:00.000Z',
            groupKind:  'other',
            groupName:  'Walkathon planning committee',
            belongLevel:'belong',
            note:       "Went in reluctant, came out enjoying the cross-school coordination — didn't expect that.",
        },
        {
            id:         'belong_seed_beyblade',
            createdAt:  '2026-06-02T07:52:00.000Z',
            groupKind:  'class',
            groupName:  'The Beyblade crew',
            belongLevel:'belong',
            note:       'Half the reason the SIL project idea is even interesting is the people around it.',
        },
        {
            id:         'belong_seed_physics',
            createdAt:  '2026-07-09T11:36:00.000Z',
            groupKind:  'class',
            groupName:  "Ms Lim's physics class",
            belongLevel:'belong',
            note:       'The one class where school actually clicks for me.',
        },
    ],
    perspectives: [
        {
            id:              'persp_seed_mrlim',
            createdAt:       '2026-06-02T07:54:00.000Z',
            source:          'teacher',
            sourceLabel:     'Mr Lim',
            observation:     'Thought my Beyblade obsession was worth turning into a real learning project.',
            vipsDimensionRef:'interests',
            agreementSelf:   'partly',
        },
        {
            id:              'persp_seed_oc',
            createdAt:       '2026-03-24T11:02:00.000Z',
            source:          'coach',
            sourceLabel:     'My OC',
            observation:     'Asked if I want the zone NCOC course — reads me as ready for more leadership.',
            vipsDimensionRef:'skills',
            agreementSelf:   'partly',
        },
        {
            id:              'persp_seed_examiner',
            createdAt:       '2026-03-06T10:40:00.000Z',
            source:          'other',
            sourceLabel:     'The badge examiner',
            observation:     'Said I froze under pressure and failed the CPR scenario.',
            vipsDimensionRef:'personality',
            agreementSelf:   'differs',
        },
        {
            id:              'persp_seed_friends',
            createdAt:       '2026-02-03T09:18:00.000Z',
            source:          'peer',
            sourceLabel:     'My CCA friends',
            observation:     'Thought CPR practice was gross — I was thinking about actually needing it one day.',
            vipsDimensionRef:'values',
            agreementSelf:   'differs',
        },
    ],
}
