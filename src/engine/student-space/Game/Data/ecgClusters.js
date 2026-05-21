/**
 * ECG (Education and Career Guidance) cluster taxonomy — hand-authored for v1.
 *
 * Each cluster is a coarse career-region the Trajectory compass can surface as
 * a bearing. Affinities are weights against canonical VIPS claim ids — when
 * trajectoryHeuristics scores a student profile against this list, the sum
 * `affinity[claimId] × profileSignal[claimId]` ranks clusters.
 *
 * Forward-additive: more clusters or finer subclusters can be added without
 * touching consumers, as long as ids stay stable. Weights are 0..1; tune by
 * intuition — the heuristic is observational, not predictive.
 *
 * Adjacency hints (`adjacents`) drive the secondary ECG tag chips on each
 * pathway card — they're the clusters most often discussed together.
 */

import { isCanonicalClaim } from './vipsTaxonomy.js'

export const ECG_CLUSTERS = [
    {
        id: 'cluster.public-service',
        label: 'Public service',
        blurb: 'Government, civic, and community-facing work where the unit of value is who you help, not what you sell.',
        affinity: {
            'values.contribution':   1.00,
            'values.tradition':      0.55,
            'values.relationships':  0.55,
            'interests.social':      0.85,
            'interests.enterprising':0.45,
            'interests.conventional':0.30,
            'skills.interpersonal':  0.80,
            'skills.communication':  0.70,
            'skills.leadership':     0.55,
            'personality.extraversion': 0.35,
        },
        adjacents: ['cluster.healthcare', 'cluster.education'],
    },
    {
        id: 'cluster.healthcare',
        label: 'Healthcare and care work',
        blurb: 'Clinical, allied health, and counselling-adjacent roles where care lands one person at a time.',
        affinity: {
            'values.contribution':   0.95,
            'values.relationships':  0.70,
            'values.wellbeing':      0.50,
            'interests.social':      0.90,
            'interests.investigative':0.55,
            'skills.interpersonal':  0.90,
            'skills.communication':  0.65,
            'skills.analytical':     0.40,
            'personality.neuroticism': 0.20,
        },
        adjacents: ['cluster.public-service', 'cluster.education'],
    },
    {
        id: 'cluster.education',
        label: 'Education and teaching',
        blurb: 'Classroom teaching, tutoring, and learning-design work where the loop is explain-and-watch-it-land.',
        affinity: {
            'values.contribution':   0.85,
            'values.learning':       0.90,
            'values.relationships':  0.60,
            'interests.social':      0.90,
            'interests.investigative':0.50,
            'interests.artistic':    0.30,
            'skills.communication':  0.95,
            'skills.interpersonal':  0.75,
            'skills.leadership':     0.45,
        },
        adjacents: ['cluster.public-service', 'cluster.healthcare'],
    },
    {
        id: 'cluster.arts',
        label: 'Arts and creative practice',
        blurb: 'Studio practice, performance, design crafts — work where the output is a thing you made and shipped.',
        affinity: {
            'values.independence':   0.65,
            'values.learning':       0.55,
            'interests.artistic':    0.95,
            'interests.realistic':   0.40,
            'skills.creative':       0.95,
            'skills.communication':  0.55,
            'skills.practical':      0.40,
        },
        adjacents: ['cluster.creative-tech', 'cluster.education'],
    },
    {
        id: 'cluster.enterprise',
        label: 'Business and enterprise',
        blurb: 'Sales, operations, founding, finance — work where you move resources and persuade people to commit.',
        affinity: {
            'values.achievement':    0.85,
            'values.independence':   0.70,
            'interests.enterprising':0.95,
            'interests.conventional':0.55,
            'skills.leadership':     0.85,
            'skills.communication':  0.70,
            'skills.analytical':     0.55,
            'personality.extraversion': 0.45,
        },
        adjacents: ['cluster.research', 'cluster.creative-tech'],
    },
    {
        id: 'cluster.research',
        label: 'Research and analysis',
        blurb: 'Investigation, science, and analytic work where the reward is figuring out what is actually true.',
        affinity: {
            'values.learning':       0.95,
            'values.achievement':    0.55,
            'interests.investigative':0.95,
            'interests.conventional':0.55,
            'skills.analytical':     0.95,
            'skills.communication':  0.45,
            'skills.creative':       0.40,
        },
        adjacents: ['cluster.healthcare', 'cluster.creative-tech'],
    },
    {
        id: 'cluster.trades',
        label: 'Skilled trades and making',
        blurb: 'Hands-on, tool-using work where the thing you make either works or it does not.',
        affinity: {
            'values.independence':   0.65,
            'values.tradition':      0.50,
            'values.security':       0.50,
            'interests.realistic':   0.95,
            'interests.conventional':0.50,
            'skills.practical':      0.95,
            'skills.analytical':     0.40,
            'skills.creative':       0.40,
        },
        adjacents: ['cluster.creative-tech', 'cluster.enterprise'],
    },
    {
        id: 'cluster.creative-tech',
        label: 'Creative technology',
        blurb: 'Software, product, and design-engineering work where shipping something useful and tasteful is the bar.',
        affinity: {
            'values.learning':       0.75,
            'values.independence':   0.55,
            'values.achievement':    0.50,
            'interests.investigative':0.65,
            'interests.artistic':    0.65,
            'interests.realistic':   0.55,
            'skills.creative':       0.80,
            'skills.analytical':     0.75,
            'skills.practical':      0.65,
            'skills.communication':  0.45,
        },
        adjacents: ['cluster.research', 'cluster.arts'],
    },
]

export const ECG_BY_ID = Object.fromEntries(ECG_CLUSTERS.map((c) => [c.id, c]))

/** Membership check parallel to isCanonicalClaim. */
export const isEcgCluster = (id) => Object.prototype.hasOwnProperty.call(ECG_BY_ID, id)

/**
 * Sanity check on boot — if any affinity points at a claim id that the VIPS
 * taxonomy does not actually carry, warn early instead of silently mis-ranking.
 * Pure read; no mutation.
 */
export function _auditEcgAffinities()
{
    for(const cluster of ECG_CLUSTERS)
    {
        for(const claimId of Object.keys(cluster.affinity))
        {
            if(!isCanonicalClaim(claimId))
                console.warn(`[ecgClusters] ${cluster.id} affinity references unknown claim "${claimId}"`)
        }
    }
}
