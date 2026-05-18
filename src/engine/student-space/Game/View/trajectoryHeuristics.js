/**
 * Pure-function trajectory generator. No LLM, no API. Mirrors
 * reframeHeuristics.js in posture — deterministic, observational, voice-of-Kira.
 *
 * trajectoryFor(profile, identity) → {
 *   throughLine: string,
 *   bearings: [{ id, title, prompt, traitTags, ecgTags, risk }, …]   // 3 entries
 * }
 *
 * Pipeline:
 *   1. Score each VIPS canonical claim by quote count × confidence weight,
 *      pulled from Profile.facets. This gives `profileSignal[claimId]`.
 *   2. For each ECG cluster, compute affinity-weighted sum of profileSignal.
 *      Top 3 clusters become bearings.
 *   3. Each bearing pairs with a hand-authored copy template per cluster id,
 *      pinning the title + exploration prompt, with trait tags drawn from the
 *      top-contributing claims to *that* cluster, and ECG tags = cluster +
 *      adjacents.
 *   4. Risk prose is picked from a small library keyed by the dominant trait
 *      combination — high-contribution + neuroticism reads "over-responsibility",
 *      etc.
 *   5. Through-line paragraph names the student (identity.name) and pulls the
 *      top two trait pairs into a single observational sentence.
 *
 * The whole thing is forward-additive — swap to an LLM later by replacing
 * trajectoryFor() and keeping the bearing shape the same.
 */

import { ECG_CLUSTERS, ECG_BY_ID } from '../Data/ecgClusters.js'
import { VIPS_BY_ID } from '../Data/vipsTaxonomy.js'

const CONFIDENCE_WEIGHT = { low: 0.5, medium: 1.0, high: 1.6 }

/** Per-cluster pathway templates — title, exploration prompt, and the
 *  MySkillsFuture (Singapore) search URL students can open to read about
 *  related careers. The search endpoint renders a real results page; the
 *  query string is the only piece a student would otherwise have to type. */
const MSF_SEARCH = 'https://www.myskillsfuture.gov.sg/content/portal/en/portal-search/portal-search.html?search=true&q='
const msfUrl = (q) => MSF_SEARCH + encodeURIComponent(q)

const BEARING_COPY = {
    'cluster.public-service': {
        title:  'Peer support and counselling foundations',
        prompt: 'Try one structured helping role with supervision, such as peer support training, a counselling-related VIA placement, or a shadowing conversation with a school counsellor or social worker. Track whether you feel grounded after the interaction, not only useful during it.',
        msfUrl: msfUrl('social service'),
    },
    'cluster.healthcare': {
        title:  'Healthcare-adjacent care work',
        prompt: 'Spend a half-day shadowing in a clinic, polyclinic, or community-care setting. Notice which parts of the day energise you — direct patient contact, coordination, or the quiet behind-the-scenes work — and which drain.',
        msfUrl: msfUrl('healthcare'),
    },
    'cluster.education': {
        title:  'Teaching, tutoring, and community learning',
        prompt: 'Run a small recurring tutoring experiment for four weeks. After each session, note what energised you, what drained you, and whether asking before helping changed the quality of the support.',
        msfUrl: msfUrl('education'),
    },
    'cluster.arts': {
        title:  'Creative practice and studio work',
        prompt: 'Pick one creative form you keep returning to and commit to one finished piece in two weeks. Track whether the satisfaction is in the making, the showing, or the discovering — those point at different career shapes.',
        msfUrl: msfUrl('arts'),
    },
    'cluster.enterprise': {
        title:  'Leading a small initiative',
        prompt: 'Propose and run a tiny project with two or three classmates — a CCA event, a stall, a campaign. Pay attention to whether you find energy in the persuading, the organising, or the deciding.',
        msfUrl: msfUrl('business'),
    },
    'cluster.research': {
        title:  'Investigation and analysis',
        prompt: 'Pick one question you keep wondering about and spend a week gathering real evidence — interviews, observations, public data. Notice whether the question gets sharper or fuzzier with more contact.',
        msfUrl: msfUrl('research'),
    },
    'cluster.trades': {
        title:  'Hands-on craft and operations',
        prompt: 'Try a hands-on programme — woodwork, basic electrical, kitchen line, lab tech — and complete one tangible thing. Notice whether the satisfaction comes from the result, the process, or the company you keep while doing it.',
        msfUrl: msfUrl('skilled trades'),
    },
    'cluster.creative-tech': {
        title:  'Creative technology and building',
        prompt: 'Build one small useful thing end-to-end — a small site, a workflow, a tool. Notice whether you are more pulled by the design decisions or the engineering ones, and whether you finish faster solo or with a collaborator.',
        msfUrl: msfUrl('digital design'),
    },
}

const MSF_FALLBACK = 'https://www.myskillsfuture.gov.sg/content/portal/en/career-resources/career-resources.html'

/** Risk copy keyed by trait combinations the bearing relies on. */
const RISK_RULES = [
    {
        when: ['values.contribution', 'personality.neuroticism'],
        text: "This route fits your relational strengths, but it can also reward over-responsibility. You would need adult supervision, clear role boundaries, and practice noticing when empathy turns into taking over.",
    },
    {
        when: ['skills.communication', 'interests.social'],
        text: "Communication work compounds fast when you’re good at it, which can mean you end up doing it for everyone. The discipline is choosing which audiences are worth the energy and saying no to the rest.",
    },
    {
        when: ['interests.investigative', 'skills.analytical'],
        text: "Investigation rewards depth, but it also rewards isolation. Watch for the version of this work that turns into long stretches of working alone with no one to test your reading against.",
    },
    {
        when: ['interests.artistic', 'skills.creative'],
        text: "Creative practice gives you a strong internal compass, but the external scaffolding — feedback, audience, deadlines — has to be built deliberately. Without it, the work can drift into private rumination.",
    },
    {
        when: ['values.achievement', 'interests.enterprising'],
        text: "Enterprising work can wire achievement to external scoreboards quickly. The longer-term question is which scoreboards you actually trust to be measuring something real.",
    },
    {
        when: ['skills.practical', 'interests.realistic'],
        text: "Practical work gives fast, honest feedback — but the trade is that the next step often requires committing to a specialism early. Try a few adjacent crafts before narrowing.",
    },
    {
        when: ['skills.leadership', 'interests.enterprising'],
        text: "Leading early often means leading without sufficient context. The risk isn’t failing to lead — it’s leading confidently in a direction you haven’t yet earned the right to be sure about.",
    },
]

const GENERIC_RISK = "Each of these pathways needs its own pacing and recovery habits. The shared task is building consent and rest into the work, not only effort."

/**
 * Tally per-claim weighted signal from a Profile.facets blob.
 * Returns `{ [claimId]: signal }` for every claim actually present.
 */
function scoreProfile(facets)
{
    const score = {}
    if(!facets || typeof facets !== 'object') return score
    for(const facet of Object.values(facets))
    {
        if(!facet || !Array.isArray(facet.quotes)) continue
        for(const q of facet.quotes)
        {
            const id = q.canonicalClaimId
            if(!id) continue
            const w = CONFIDENCE_WEIGHT[q.confidence] || 1.0
            score[id] = (score[id] || 0) + w
        }
    }
    return score
}

/** Sum cluster affinity × profileSignal. Records top-contributing claim ids. */
function scoreClusters(profileSignal)
{
    return ECG_CLUSTERS.map((cluster) =>
    {
        let total = 0
        const contributions = []
        for(const [claimId, weight] of Object.entries(cluster.affinity))
        {
            const s = profileSignal[claimId] || 0
            if(s <= 0) continue
            const contrib = s * weight
            total += contrib
            contributions.push({ claimId, contrib })
        }
        contributions.sort((a, b) => b.contrib - a.contrib)
        return { cluster, total, contributions }
    }).sort((a, b) => b.total - a.total)
}

function pickRisk(traitTags)
{
    const tagSet = new Set(traitTags)
    for(const rule of RISK_RULES)
    {
        if(rule.when.every((claimId) => tagSet.has(claimId))) return rule.text
    }
    return GENERIC_RISK
}

function pronounFor(identity)
{
    const n = identity?.name?.trim()
    if(!n || n === 'Student') return { possessive: 'Your', subject: 'You' }
    return { possessive: `${n}'s`, subject: n }
}

function buildThroughLine(scoredClusters, identity)
{
    const top = scoredClusters.filter((c) => c.total > 0).slice(0, 3)
    if(top.length === 0)
    {
        return 'Not enough signal in the profile yet to draw a confident bearing. Capture a few more reflections in Ask or Mood and the compass will sharpen.'
    }
    const { possessive } = pronounFor(identity)
    const lead = top[0].cluster.blurb.toLowerCase()
    const verbs = top.length > 1 ? top.slice(0, 2).map((c) => c.cluster.label.toLowerCase()).join(' or ') : top[0].cluster.label.toLowerCase()
    return `${possessive} current through-line is not simply a job title; it is the kind of work where ${lead} The strongest evidence points toward supervised people-facing pathways where care can be practised with boundaries — ${verbs}, or adjacent routes. The main developmental task is to keep the warmth while building consent, pacing, and recovery habits.`
}

function buildBearing(scored, index)
{
    const id = scored.cluster.id
    const copy = BEARING_COPY[id] || { title: scored.cluster.label, prompt: scored.cluster.blurb }
    const traitTags = scored.contributions.slice(0, 4).map((c) => c.claimId)
    const ecgTags = [id, ...(scored.cluster.adjacents || [])].slice(0, 3)
    const risk = pickRisk(traitTags)
    return {
        id:        `b_${index}_${id.replace(/\./g, '_')}`,
        clusterId: id,
        title:     copy.title,
        prompt:    copy.prompt,
        traitTags,
        ecgTags,
        risk,
        msfUrl:    copy.msfUrl || MSF_FALLBACK,
    }
}

export function trajectoryFor(profile, identity)
{
    const facets = profile?.facets || profile  // accept either Profile or raw facets blob
    const signal = scoreProfile(facets)
    const ranked = scoreClusters(signal)
    const top = ranked.slice(0, 3)
    const bearings = top.map((s, i) => buildBearing(s, i + 1))
    const throughLine = buildThroughLine(ranked, identity)
    return { throughLine, bearings }
}

/** Resolve a claim id to its human label, for tag-pill rendering. */
export function claimLabelOf(id)   { return VIPS_BY_ID[id]?.label ?? id }
export function clusterLabelOf(id) { return ECG_BY_ID[id]?.label ?? id }

/** Pretty-cased facet name, e.g. "interests" → "Interests". */
const FACET_DISPLAY = {
    values:      'Values',
    interests:   'Interests',
    personality: 'Personality',
    skills:      'Skills',
}

/**
 * Two-part chip data for a VIPS claim id: `{ kicker, label, title }`.
 * Example: 'interests.social' → { kicker: 'Interests', label: 'Social', title: 'interests.social' }.
 * `kicker` is the facet, `label` is the claim within that facet, and `title`
 * is the raw id which we surface as an HTML `title` tooltip for the curious.
 */
export function traitChipOf(id)
{
    const entry = VIPS_BY_ID[id]
    if(!entry) return { kicker: '', label: id, title: id }
    return {
        kicker: FACET_DISPLAY[entry.facet] || entry.facet || '',
        label:  entry.label || id,
        title:  id,
    }
}

/**
 * One-part chip data for an ECG cluster id, e.g.
 * 'cluster.healthcare' → { label: 'Healthcare and care work', title: 'cluster.healthcare' }.
 * Cluster labels are already prose, so no kicker is needed.
 */
export function ecgChipOf(id)
{
    const entry = ECG_BY_ID[id]
    return {
        label: entry?.label || id,
        title: id,
    }
}
