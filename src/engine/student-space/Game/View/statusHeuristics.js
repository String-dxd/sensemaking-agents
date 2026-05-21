/**
 * Identity-status classifier — pure-function, no LLM, mirrors
 * trajectoryHeuristics.js posture.
 *
 * Maps engine slice state to one of the five identity statuses used in the
 * MOE CCE / Marcia framing (doc: Project development template, 2026-05-18):
 *
 *   - starter     no captures, no facet quotes, no choices — empty profile
 *   - diffused    low exploration, low commitment
 *   - searching   high exploration, low commitment   (Marcia: moratorium)
 *   - foreclosed  low exploration, high commitment
 *   - achieved    high exploration, high commitment
 *
 * The pedagogical goal stated in the brief is:
 *   - move Searching / Foreclosed → Achieved
 *   - move Diffused → Searching
 *
 * v1 thresholds are conservative — most demo students land in `searching`
 * (which preserves the current TrajectorySheet UX). Boundaries are spelled
 * out below so they are tunable from one place.
 */
export const STATUS_IDS = ['starter', 'diffused', 'searching', 'foreclosed', 'achieved']

// Exploration thresholds.
//
// `low` band      — score < 2: not enough breadth/depth to ground bearings
// `emerging` band — 2 ≤ score < 4: visible but not yet "high" exploration
//                   (collapses to the Marcia `low` axis bucket for the 2×2)
// `high` band     — score ≥ 4
const EXPLORATION_HIGH = 4
const EXPLORATION_EMERGING = 2

// Commitment thresholds.
//
// `low` band   — score < 2: at most one logged decision, no intentions
// `high` band  — score ≥ 2: an intention, multiple decisions, or
//                a decision + a clear dominant pattern
const COMMITMENT_HIGH = 2

const CONFIDENCE_WEIGHT = { low: 0.5, medium: 1.0, high: 1.6 }

/**
 * Compute exploration score from Profile.facets + Captures.entries.
 * Distinct claims touched dominate; ask-capture count and a backend
 * Cartographer presence add weight.
 */
function scoreExploration(facets, captures)
{
    const inputs = { distinctClaims: 0, weightedQuotes: 0, askCount: 0, hasBackendCartographer: false }

    if(facets && typeof facets === 'object')
    {
        const claimSet = new Set()
        for(const facet of Object.values(facets))
        {
            if(!facet || !Array.isArray(facet.quotes)) continue
            for(const q of facet.quotes)
            {
                if(!q.canonicalClaimId) continue
                claimSet.add(q.canonicalClaimId)
                inputs.weightedQuotes += CONFIDENCE_WEIGHT[q.confidence] || 1.0
            }
        }
        inputs.distinctClaims = claimSet.size
    }

    if(Array.isArray(captures))
    {
        for(const c of captures)
        {
            if(c?.kind === 'ask') inputs.askCount += 1
            if(c?.kind === 'trajectory' && c.backendCartographerOutputId)
            {
                inputs.hasBackendCartographer = true
            }
        }
    }

    // A successful backend Cartographer reading is a high-exploration signal
    // on its own: the pipeline only produces bearings when the student has
    // enough quote evidence to anchor them. Bumping by 4 puts the student
    // straight into the `high` band even if local facets haven't hydrated
    // yet (matters for backend-active demos where facets stream in later).
    const score = inputs.distinctClaims
        + inputs.askCount * 0.5
        + (inputs.hasBackendCartographer ? 4 : 0)

    let band
    if(score >= EXPLORATION_HIGH) band = 'high'
    else if(score >= EXPLORATION_EMERGING) band = 'emerging'
    else band = 'low'

    return { score, band, inputs }
}

/**
 * Compute commitment score from Choices.decisions + Choices.intentions.
 * Intentions weigh heavier than decisions because they are explicitly
 * forward-facing (a committed direction, not just a logged choice).
 */
function scoreCommitment(decisions, intentions, dominantPatternTag)
{
    const inputs = {
        decisionCount:  Array.isArray(decisions)  ? decisions.length  : 0,
        intentionCount: Array.isArray(intentions) ? intentions.length : 0,
        dominantPatternTag: dominantPatternTag || null,
    }

    const score = inputs.decisionCount * 1
        + inputs.intentionCount * 1.5
        + (inputs.dominantPatternTag ? 1 : 0)

    const band = score >= COMMITMENT_HIGH ? 'high' : 'low'
    return { score, band, inputs }
}

/** One-line plain-English summary of why the classifier picked this status. */
function reasonFor(status, exploration, commitment)
{
    const ex = exploration.inputs
    const co = commitment.inputs
    const xparts = []
    if(ex.distinctClaims > 0) xparts.push(`${ex.distinctClaims} VIPS claim${ex.distinctClaims === 1 ? '' : 's'}`)
    if(ex.askCount > 0)       xparts.push(`${ex.askCount} chat${ex.askCount === 1 ? '' : 's'} with Kira`)
    if(ex.hasBackendCartographer) xparts.push('a Cartographer reading')
    const xline = xparts.length ? xparts.join(' · ') : 'no profile evidence yet'

    const cparts = []
    if(co.decisionCount > 0)  cparts.push(`${co.decisionCount} logged decision${co.decisionCount === 1 ? '' : 's'}`)
    if(co.intentionCount > 0) cparts.push(`${co.intentionCount} change intention${co.intentionCount === 1 ? '' : 's'}`)
    if(co.dominantPatternTag) cparts.push(`a ${co.dominantPatternTag} pattern`)
    const cline = cparts.length ? cparts.join(' · ') : 'no commitments logged'

    switch(status)
    {
        case 'starter':    return 'Path Finder works best after a few reflections. Nothing in the profile yet.'
        case 'diffused':   return `Light exploration so far (${xline}) and ${cline}.`
        case 'searching':  return `Active exploration (${xline}) but ${cline}.`
        case 'foreclosed': return `${cline} — but ${xline}. Worth widening the lens.`
        case 'achieved':   return `Strong exploration (${xline}) and ${cline}.`
        default:           return ''
    }
}

/**
 * statusFor — the only export call sites need.
 *
 * Accepts the raw slice values (not the singleton instances) so this stays
 * test-friendly. Returns an audit object: { status, exploration, commitment,
 * reason }. Callers pick `audit.status` for routing and `audit.reason` for
 * the visible tooltip.
 */
export function statusFor({ facets, captures, decisions, intentions, dominantPatternTag } = {})
{
    const exploration = scoreExploration(facets, captures)
    const commitment  = scoreCommitment(decisions, intentions, dominantPatternTag)

    // Starter wins outright when both axes have literally nothing — this
    // matters because Marcia's `diffused` quadrant still implies the student
    // has been *asked* and refused to engage. A brand-new student with zero
    // data shouldn't be labelled diffused; they're pre-Marcia.
    const isStarter = exploration.score === 0 && commitment.score === 0

    let status
    if(isStarter)                                       status = 'starter'
    else if(exploration.band === 'high'  && commitment.band === 'low')  status = 'searching'
    else if(exploration.band === 'high'  && commitment.band === 'high') status = 'achieved'
    else if(exploration.band !== 'high'  && commitment.band === 'high') status = 'foreclosed'
    else                                                                status = 'diffused'

    return {
        status,
        exploration,
        commitment,
        reason: reasonFor(status, exploration, commitment),
    }
}

/** Human-readable label for the status pill. */
export function statusLabelOf(id)
{
    switch(id)
    {
        case 'starter':    return 'Just getting started'
        case 'diffused':   return 'Diffused'
        case 'searching':  return 'Searching'
        case 'foreclosed': return 'Foreclosed'
        case 'achieved':   return 'Achieved'
        default:           return id
    }
}

/**
 * Per-status header copy — eyebrow, title, lead paragraph.
 *
 * Lifted from the CCE doc's vocabulary (Marcia statuses) so what the
 * student sees on screen matches what the teacher will name in class.
 */
export function statusCopyOf(id, identity)
{
    const name = identity?.name && identity.name !== 'Student' ? identity.name : null
    const youOrName = name || 'you'

    switch(id)
    {
        case 'starter':
            return {
                eyebrow: 'PATH FINDER',
                title:   `Hi${name ? `, ${name}` : ''} — let's find your bearings`,
                tldr:    'Path Finder needs a bit more to read before it can suggest anything.',
                lead:    `Path Finder reads your VIPS profile + Choices to suggest the kind of work that might fit. Right now there isn't much to read yet — a short chat with Kira will give it something to work with.`,
            }
        case 'diffused':
            return {
                eyebrow: 'PATH FINDER · DIFFUSED',
                title:   'Your map is still mostly blank',
                tldr:    'Three small reflections, each one adds a claim to your profile.',
                lead:    `There aren't enough reflections yet to draw a confident bearing. Try one of the nudges below — each is a small reflection that adds a claim to ${youOrName === 'you' ? 'your' : `${youOrName}'s`} profile.`,
            }
        case 'searching':
            return {
                eyebrow: 'PATH FINDER · SEARCHING',
                title:   'You\'re in active exploration',
                tldr:    'Bearings the evidence points toward — none of these is a decision yet.',
                lead:    `These are the bearings the profile evidence currently points toward. None of these is a decision yet — each one is a direction worth probing.`,
            }
        case 'foreclosed':
            return {
                eyebrow: 'PATH FINDER · FORECLOSED',
                title:   'You\'ve named a direction — worth widening the lens',
                tldr:    'A direction is named in Choices. Here are bearings to test it against.',
                lead:    `A direction has been committed to in Choices, but the VIPS profile is still thin. Before locking in, here are one or two adjacent bearings to test the assumption against.`,
            }
        case 'achieved':
            return {
                eyebrow: 'PATH FINDER · ACHIEVED',
                title:   'Concrete next steps for your direction',
                tldr:    'Each bearing below now carries near-term actions you can take this term.',
                lead:    `Profile evidence is strong and a direction has been committed to. Each bearing below now carries near-term actions you can actually take this term.`,
            }
        default:
            return { eyebrow: 'PATH FINDER', title: 'Trajectory compass', tldr: '', lead: '' }
    }
}

/**
 * Diffused-quadrant reflection nudges — three short prompts that, when
 * tapped, open the Ask sheet with the prompt pre-seeded.
 */
export const DIFFUSED_NUDGES = [
    {
        id: 'nudge-recent-energy',
        title: 'When did you last lose track of time?',
        prompt: 'Think about the last week or two. When did you lose track of time, in a good way? What were you doing? Walk me through it.',
    },
    {
        id: 'nudge-recent-drain',
        title: 'What part of school drains you fastest?',
        prompt: 'What part of the school day drains you fastest? Not the boring parts — the parts that leave you actually tired. Talk me through one example.',
    },
    {
        id: 'nudge-help-asked-for',
        title: 'When have classmates asked for your help?',
        prompt: 'When have classmates asked for your help recently? What were they asking for, and why you specifically?',
    },
]

/** Starter-state single prompt. */
export const STARTER_PROMPT = {
    id: 'starter-first-chat',
    title: 'Start a short reflection with Kira',
    prompt: 'I want to start figuring out my post-secondary path. Where should I begin?',
}

/**
 * Per-cluster concrete action templates — surfaced in the Achieved quadrant
 * under each bearing card. Keys mirror BEARING_COPY in trajectoryHeuristics.js
 * so a bearing without an action list falls back to the GENERIC_ACTIONS line.
 */
const ACTIONS_BY_CLUSTER = {
    'cluster.public-service': [
        'Sign up for peer support training this term.',
        'Shadow a school counsellor or social worker for one session.',
        'Volunteer at a community-care VIA placement and log what energised you vs drained you.',
    ],
    'cluster.healthcare': [
        'Book a half-day shadow at a polyclinic or community clinic.',
        'Talk to one healthcare worker — clinical or non-clinical — about their week.',
        'Sit in on a first-aid or community-health workshop this month.',
    ],
    'cluster.education': [
        'Run a 4-week tutoring experiment for a younger student.',
        'After each session, write one line on what energised you and what drained you.',
        'Ask one teacher how they decide when to step in vs let the student struggle.',
    ],
    'cluster.arts': [
        'Commit to one finished piece in two weeks — small is fine.',
        'Show the piece to two people whose taste you respect; note their reactions.',
        'Pick one practitioner whose work you admire and read their origin story.',
    ],
    'cluster.enterprise': [
        'Propose one tiny project with two classmates — a stall, a campaign, an event.',
        'Track who shows up to the planning vs the execution; note what that tells you.',
        'After the project, name one thing you would do differently next time.',
    ],
    'cluster.research': [
        'Pick one question you can\'t stop thinking about. Spend a week gathering real evidence on it.',
        'Interview one adult who lives close to that question.',
        'Write one paragraph on whether the question got sharper or fuzzier.',
    ],
    'cluster.trades': [
        'Try a hands-on programme — woodwork, electrical, kitchen line, lab tech — and finish one tangible thing.',
        'Talk to one tradesperson about their first year on the job.',
        'Note whether the satisfaction comes from the result, the process, or the company.',
    ],
    'cluster.creative-tech': [
        'Build one small useful thing end-to-end this month — a tool, a site, a workflow.',
        'Show it to one person and watch them use it without explanation.',
        'Note whether you were more pulled by the design or the engineering decisions.',
    ],
}

const GENERIC_ACTIONS = [
    'Pick one short experiment (one week, low stakes) that tests this direction.',
    'Talk to one adult who lives in this space about their first year doing it.',
    'After two weeks, write a single paragraph on whether the direction got sharper or fuzzier.',
]

/** Action list for an Achieved-quadrant bearing card. Always returns 3 items. */
export function actionsForCluster(clusterId)
{
    return ACTIONS_BY_CLUSTER[clusterId] || GENERIC_ACTIONS
}

/**
 * Foreclosed-quadrant framing prompt — opens Ask with this seed so the
 * student articulates what evidence would change their committed direction.
 */
export const FORECLOSED_CHALLENGE_PROMPT = {
    id: 'foreclosed-challenge',
    title: 'What would change your mind?',
    prompt: 'I\'ve been pretty set on one direction. What evidence — from a class, a conversation, a trial run — would actually make me reconsider?',
}
