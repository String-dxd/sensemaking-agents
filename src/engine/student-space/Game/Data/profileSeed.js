/**
 * Hand-authored Profile seed for v1.1. Cold-start hydrates from here when
 * no `ss:v1:profile` slice exists in localStorage. v1.2's Connector/Verifier
 * will replace this with LLM-extracted quotes that point to canonical claim
 * IDs from the same VIPS taxonomy.
 *
 * Voice: Singaporean secondary student. Quotes are paraphrased reflections,
 * not literal verbatim transcripts — the same posture v1.2's Verifier will
 * apply when it gates quoted evidence.
 *
 * Each facet:
 *   - paragraph    : 2–3 sentences in calm prose, neutral persona
 *   - openQuestion : drawn from a behavioral indicator in the taxonomy
 *   - quotes       : 5–8 entries, mixed claim ids within the facet
 *   - lastRefinedAt: a real ISO string (overridden by Profile.refine when the
 *                    student or future Connector touches the facet)
 */

const today = new Date().toISOString()
const q = (id, text, canonicalClaimId, confidence = 'medium', sourceCaptureId = null) => ({
    id,
    text,
    canonicalClaimId,
    confidence,
    sourceCaptureId,
    createdAt: today,
})

export const PROFILE_SEED = {
    values: {
        id:           'values',
        paragraph:    'Contribution and relationships sit close to the centre of how you choose your effort. You return often to moments where another person feels seen or less alone, and you tend to take a slightly longer route if the endpoint fits that kind of care. The edge to watch is over-ownership: care lands deeper when you ask before stepping in.',
        openQuestion: 'How do you keep your helper instinct while learning when to ask, wait, or let someone else carry the problem?',
        lastRefinedAt: today,
        quotes: [
            q('q_v01', 'I don\'t think I want the shortcut if it lands me somewhere I don\'t fit.',                'values.independence', 'medium'),
            q('q_v02', 'You just keep showing up and one day they ask you for water and you know.',               'values.contribution', 'medium'),
            q('q_v03', 'My mum says fee or no fee, you finish what you started.',                                  'values.tradition',    'high'),
            q('q_v04', 'I want to do well, but only on things I actually pick.',                                   'values.achievement',  'medium'),
            q('q_v05', 'Sleep first. The maths waits.',                                                             'values.wellbeing',    'medium'),
            q('q_v06', 'I keep asking why before I take notes — the teacher gets a bit annoyed sometimes.',        'values.learning',     'high'),
            q('q_v07', 'I think I want to live near my grandma when I can choose.',                                'values.relationships','low'),
        ],
    },

    interests: {
        id:           'interests',
        paragraph:    'You show a strong Social pull and a quieter Investigative thread. Teaching, peer support, and small everyday helping all hold your attention when there is a real person on the other end. Academic content gets more motivating when it can be explained, translated, or used in service of someone else.',
        openQuestion: 'Which people-facing settings energise you after repeated exposure — teaching, social work, community outreach, or something adjacent?',
        lastRefinedAt: today,
        quotes: [
            q('q_i01', 'It\'s never felt like a chore. Maybe that\'s data.',                                       'interests.social',       'high'),
            q('q_i02', 'The maths only sticks when there\'s a person on the other end of it.',                     'interests.social',       'medium'),
            q('q_i03', 'I came back feeling full, not tired. The other VIA sessions I came back tired.',           'interests.social',       'high'),
            q('q_i04', 'I jumped in to mediate between her and Shafiqah without anyone asking me.',                'interests.enterprising', 'medium'),
            q('q_i05', 'I keep wanting to know why the bus is always late at exactly that turn.',                  'interests.investigative','medium'),
            q('q_i06', 'I redrew the cover three times before I gave up on it. The third one was actually mine.',  'interests.artistic',     'low'),
            q('q_i07', 'I like when the table of contents is correct. It\'s a small thing.',                       'interests.conventional', 'low'),
        ],
    },

    personality: {
        id:           'personality',
        paragraph:    'You read as socially responsive and emotionally absorbent. Warm human contact lifts you, you notice relational tension quickly, and you can feel hurt deeply when your care lands badly. This is not a diagnosis — it is a pattern that points at both relational strength and a need for recovery space after conflict.',
        openQuestion: 'Can you build a pause-and-ask habit that protects relationships without making you feel fake or less warm?',
        lastRefinedAt: today,
        quotes: [
            q('q_p01', 'I left feeling lighter than yesterday but not light.',                                     'personality.neuroticism',  'low'),
            q('q_p02', 'I was just talking to him. But I noticed I came back feeling full, not tired.',            'personality.extraversion', 'medium'),
            q('q_p03', 'I went home and cried in the bus.',                                                        'personality.neuroticism',  'medium'),
            q('q_p04', 'In the canteen I keep checking who\'s sitting alone before I sit down.',                   'personality.extraversion', 'medium'),
            q('q_p05', 'I replayed what I said to her about four times on the way home.',                          'personality.neuroticism',  'high'),
        ],
        // Big-Five scaffold — hand-authored display data for the Personality
        // tab. Five traits, two aspects each (Big Five Aspects Scale; DeYoung
        // 2007). `position` is a 0–1 lean on the named-pole spectrum; raw
        // aspect scores (0–20) appear only inside the per-trait disclosure.
        // `tag` is the hand-authored identity headline shown on each
        // Recognition card — identity language, never performance language.
        // Copy is anchored to Alice's existing personality paragraph above:
        // socially responsive, emotionally absorbent, warm, curious.
        bigFive: {
            tldr: {
                eyebrow:  'Your personality at a glance',
                headline: 'Curious and tender — you bring imagination and a soft landing',
                poles:    ['Curiosity', 'Warmth', 'Sensitive'],
                meta:     'Five-trait lean, anchored in your reflections so far',
            },
            traits: [
                {
                    id:            'curiosity',
                    name:          'Curiosity',
                    tag:           'Imaginative explorer',
                    position:      0.78,
                    poleLeft:      'Sticks with familiar',
                    poleRight:     'Tries new things',
                    schoolReadout: 'You ask "why" before you take notes. New chapters open faster for you than for friends who need the chapter to settle first.',
                    aspects: [
                        { name: 'Imagination', score: 15, lean: 'right',  blurb: 'You picture the scene around the answer, not just the answer. Stories, what-ifs, and side angles are how new ideas land.' },
                        { name: 'Intellect',   score: 13, lean: 'right',  blurb: 'You like ideas you can argue with. Puzzles, debates, "but what if" questions all hold your attention longer than rote drills.' },
                    ],
                },
                {
                    id:            'social-energy',
                    name:          'Social Energy',
                    tag:           'Close-circle warmer',
                    position:      0.58,
                    poleLeft:      'Recharges alone',
                    poleRight:     'Recharges with people',
                    schoolReadout: 'Time with one or two people leaves you fuller, not tired. Crowds and assemblies are not your battery — close friends are.',
                    aspects: [
                        { name: 'Enthusiasm',    score: 13, lean: 'right',  blurb: 'When something lands, you light up visibly. People around you can tell when you care about a project.' },
                        { name: 'Assertiveness', score: 10, lean: 'center', blurb: 'You will speak up when something matters, but you do not push to lead. In group work you tend to steer quietly, not loudly.' },
                    ],
                },
                {
                    id:            'warmth',
                    name:          'Warmth',
                    tag:           'Soft lander',
                    position:      0.82,
                    poleLeft:      'Direct',
                    poleRight:     'Caring',
                    schoolReadout: 'You are often the person friends come to when something is off. Watch for the cost — care lands deeper when you also let someone carry the problem back.',
                    aspects: [
                        { name: 'Compassion', score: 16, lean: 'right',  blurb: 'You read the room quickly and feel what your friends feel. It is a strength and a small drain — both can be true.' },
                        { name: 'Politeness', score: 12, lean: 'center', blurb: 'You generally keep things smooth, but you will say the hard thing when a friendship needs honesty more than peace.' },
                    ],
                },
                {
                    id:            'follow-through',
                    name:          'Follow-Through',
                    tag:           'Quiet finisher',
                    position:      0.55,
                    poleLeft:      'Spontaneous',
                    poleRight:     'Structured',
                    schoolReadout: 'You finish what you commit to, but plans live more in your head than on paper. A small visible list usually helps deadlines stop creeping up.',
                    aspects: [
                        { name: 'Industriousness', score: 14, lean: 'right',  blurb: 'You will keep going past the point where most peers stop, especially on things that matter to a person, not just a grade.' },
                        { name: 'Orderliness',     score: 9,  lean: 'center', blurb: 'Your room and your bag are not the system. The system is how the people around you are doing.' },
                    ],
                },
                {
                    id:            'emotional-sensitivity',
                    name:          'Emotional Sensitivity',
                    tag:           'Deep feeler',
                    position:      0.68,
                    poleLeft:      'Steady',
                    poleRight:     'Sensitive',
                    schoolReadout: 'You feel things deeply and replay conversations on the bus home. Recovery space is not optional for you — building a short wind-down routine matters more than trying not to feel.',
                    aspects: [
                        { name: 'Withdrawal', score: 13, lean: 'right',  blurb: 'Under pressure you go quiet before you talk. Friends who know you can read the pause; the ones who don\'t sometimes misread it as cold.' },
                        { name: 'Volatility', score: 11, lean: 'center', blurb: 'You do not flash hot easily, but a single hurt can sit with you for the rest of the day. Cooling down is not the same as moving on.' },
                    ],
                },
            ],
        },
    },

    skills: {
        id:           'skills',
        paragraph:    'Your clearest skills are interpersonal trust-building and communication. You help people talk without feeling judged, you explain ideas through the learner\'s confusion, and you bridge between adults, peers, and neighbours. The next skill edge is boundary-setting: making your support explicit, consent-based, and sustainable.',
        openQuestion: 'What structured roles let you practise care with supervision and boundaries, instead of relying only on instinct?',
        lastRefinedAt: today,
        quotes: [
            q('q_s01', 'Took me 5 minutes. She gave me kuih lapis and we talked about her son in Australia for half an hour.',  'skills.interpersonal',  'medium'),
            q('q_s02', 'I made her teh-o and asked her to sit.',                                                                'skills.interpersonal',  'medium'),
            q('q_s03', 'Explaining it to her, I suddenly understood it better than when I was doing it myself.',                'skills.communication',  'high'),
            q('q_s04', 'I wrote down each step in order before I started the experiment. It actually worked.',                  'skills.practical',      'medium'),
            q('q_s05', 'When the group froze I asked, "okay what\'s the smallest thing we can do in five minutes?"',            'skills.leadership',     'medium'),
            q('q_s06', 'I noticed the chart was misleading because the y-axis didn\'t start at zero. Nobody else saw it.',      'skills.analytical',     'medium'),
            q('q_s07', 'I made the poster from scratch instead of using the school template. Ms Lim let me.',                   'skills.creative',       'low'),
        ],
    },
}
