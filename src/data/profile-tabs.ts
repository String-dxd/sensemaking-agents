/**
 * Profile tab vocabulary — superset of `VipsDimension`.
 *
 * VIPS is a closed canonical taxonomy consumed by Connector/Cartographer/
 * verifier/server. The Profile *surface* is broader than VIPS: it also
 * carries Relationships and Choices tabs (added 2026-05) that have their
 * own data shapes and are NOT part of the canonical claim taxonomy.
 *
 * Anything that wants to enumerate tabs in the Profile tab rail reads
 * `PROFILE_TABS` from here. Anything that needs the four VIPS dimensions
 * (canonical claim lookup, agent pipeline, seed data) keeps reading
 * `VIPS_DIMENSIONS` from `~/data/vips-taxonomy`.
 */

import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'

export type NonVipsProfileTab = 'relationships' | 'choices'

export type ProfileTab = VipsDimension | NonVipsProfileTab

export const NON_VIPS_PROFILE_TABS: readonly NonVipsProfileTab[] = [
  'relationships',
  'choices',
] as const

export const PROFILE_TABS: readonly ProfileTab[] = [
  ...VIPS_DIMENSIONS,
  ...NON_VIPS_PROFILE_TABS,
] as const

export function isProfileTab(value: string): value is ProfileTab {
  return (PROFILE_TABS as readonly string[]).includes(value)
}

export function isNonVipsProfileTab(value: string): value is NonVipsProfileTab {
  return (NON_VIPS_PROFILE_TABS as readonly string[]).includes(value)
}

export const PROFILE_TAB_LABEL: Record<ProfileTab, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
  relationships: 'Relationships',
  choices: 'Choices',
}

export interface ProfileTabHeader {
  eyebrow: string
  tag: string
  title: string
  subtitle: string
}

export const PROFILE_TAB_HEADERS: Record<NonVipsProfileTab, ProfileTabHeader> = {
  relationships: {
    eyebrow: 'WHO IS IN MY LIFE',
    tag: 'Relationships',
    title: 'Who is in my life',
    subtitle: 'The people, the groups, and how others see you',
  },
  choices: {
    eyebrow: "WHAT I'VE CHOSEN, AND WHY",
    tag: 'Choices',
    title: "What I've chosen, and why",
    subtitle: 'A log of real decisions and the patterns across them',
  },
}

export interface ProfileTabTheme {
  accent: string
  soft: string
  ink: string
  tab: string
  callout: string
  border: string
  text: string
}

export const PROFILE_TAB_THEMES: Record<NonVipsProfileTab, ProfileTabTheme> = {
  relationships: {
    accent: '#D08A4A',
    soft: '#F6E4CC',
    ink: '#7A4413',
    tab: 'border-[#D08A4A] bg-[#F6E4CC] text-[#7A4413]',
    callout: 'bg-[#F6E4CC] text-[#7A4413]',
    border: 'border-[#D08A4A]',
    text: 'text-[#7A4413]',
  },
  choices: {
    accent: '#5C8FB0',
    soft: '#DDEAF3',
    ink: '#2F5773',
    tab: 'border-[#5C8FB0] bg-[#DDEAF3] text-[#2F5773]',
    callout: 'bg-[#DDEAF3] text-[#2F5773]',
    border: 'border-[#5C8FB0]',
    text: 'text-[#2F5773]',
  },
}
