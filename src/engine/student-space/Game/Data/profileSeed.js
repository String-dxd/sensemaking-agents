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
