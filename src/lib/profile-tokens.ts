/**
 * Shared profile design tokens — semantic source of truth for the four VIPS
 * dimensions' colors, student-voice headers, and typography.
 *
 * Consumed by:
 *   - React: src/components/ProfileSheetChrome.tsx, src/components/share/*
 *   - PDF:   src/components/share/ProfilePdfDocument.tsx (via @react-pdf/renderer)
 *   - Engine: src/engine/student-space/Game/View/profile-tokens.constants.js
 *             (hand-maintained mirror, drift-checked by test/lib/profile-tokens.test.ts)
 *
 * The engine cannot import this TS file directly (the engine substrate stays
 * vanilla JS per docs/solutions/2026-05-18-island-progression-engine-substrate.md);
 * the mirror keeps the engine substrate-isolated while a CI test prevents drift.
 */

import { VIPS_DIMENSIONS, type VipsDimension } from '~/data/vips-taxonomy'

export type ProfileDimension = VipsDimension

export const PROFILE_DIMENSIONS = VIPS_DIMENSIONS

export const DIMENSION_LABEL: Record<ProfileDimension, string> = {
  values: 'Values',
  interests: 'Interests',
  personality: 'Personality',
  skills: 'Skills',
}

export interface ProfileColorTokens {
  accent: string
  soft: string
  ink: string
}

/**
 * Cross-surface color tokens — every engine, React, and PDF surface uses these.
 * Mirrored verbatim by src/engine/student-space/Game/View/profile-tokens.constants.js.
 */
export const PROFILE_COLORS: Record<ProfileDimension, ProfileColorTokens> = {
  values: { accent: '#A07659', soft: '#EAD7BE', ink: '#6A4A26' },
  interests: { accent: '#FF8E8E', soft: '#FDE0E0', ink: '#A84D4D' },
  personality: { accent: '#8E6FB8', soft: '#E8DDF2', ink: '#4C3470' },
  skills: { accent: '#82B16A', soft: '#DDEDC6', ink: '#3F6F2A' },
}

export interface ProfileHeader {
  eyebrow: string
  tag: string
  title: string
  subtitle: string
}

/**
 * Student-voice headers per dimension. ASCII apostrophes only — the engine and
 * React surfaces both read these and we want byte-identical strings across
 * surfaces. Mirrored verbatim by the engine .constants.js file.
 */
export const PROFILE_HEADERS: Record<ProfileDimension, ProfileHeader> = {
  values: {
    eyebrow: 'WHAT MATTERS TO ME',
    tag: 'Values',
    title: 'What you keep coming back to',
    subtitle: 'A pattern across your touchstones',
  },
  interests: {
    eyebrow: 'WHAT PULLS YOUR ATTENTION',
    tag: 'Interests',
    title: 'What lights you up',
    subtitle: 'Small sparks across your week',
  },
  personality: {
    eyebrow: 'HOW YOU TEND TO SHOW UP',
    tag: 'Personality',
    title: 'Who you are in the room',
    subtitle: 'Patterns in how others recognise you',
  },
  skills: {
    eyebrow: "WHAT YOU'RE GETTING GOOD AT",
    tag: 'Skills',
    title: "What's growing in your hands",
    subtitle: "Things you've practised into shape",
  },
}

export interface ProfileThemeTokens extends ProfileColorTokens {
  tab: string
  callout: string
  border: string
  text: string
}

/**
 * Tailwind utility-class strings layered on top of the shared color tokens.
 * Used by React surfaces (ProfileSheetChrome, PublicProfilePage). The engine
 * substrate uses raw CSS variables instead of Tailwind, so this layer is not
 * mirrored to the engine .constants.js file.
 */
export const PROFILE_THEMES: Record<ProfileDimension, ProfileThemeTokens> = {
  values: {
    ...PROFILE_COLORS.values,
    tab: 'border-[#A07659] bg-[#EAD7BE] text-[#6A4A26]',
    callout: 'bg-[#EAD7BE] text-[#6A4A26]',
    border: 'border-[#A07659]',
    text: 'text-[#6A4A26]',
  },
  interests: {
    ...PROFILE_COLORS.interests,
    tab: 'border-[#FF8E8E] bg-[#FDE0E0] text-[#A84D4D]',
    callout: 'bg-[#FDE0E0] text-[#A84D4D]',
    border: 'border-[#FF8E8E]',
    text: 'text-[#A84D4D]',
  },
  personality: {
    ...PROFILE_COLORS.personality,
    tab: 'border-[#8E6FB8] bg-[#E8DDF2] text-[#4C3470]',
    callout: 'bg-[#E8DDF2] text-[#4C3470]',
    border: 'border-[#8E6FB8]',
    text: 'text-[#4C3470]',
  },
  skills: {
    ...PROFILE_COLORS.skills,
    tab: 'border-[#82B16A] bg-[#DDEDC6] text-[#3F6F2A]',
    callout: 'bg-[#DDEDC6] text-[#3F6F2A]',
    border: 'border-[#82B16A]',
    text: 'text-[#3F6F2A]',
  },
}

/**
 * Typography tokens. React + PDF consume directly; the engine substrate keeps
 * its own font setup in style.css and does not import this.
 */
export const TYPOGRAPHY = {
  fontFamily: {
    display: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    body: '"Inter", system-ui, -apple-system, sans-serif',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  scale: {
    eyebrow: '0.75rem',
    body: '0.95rem',
    subtitle: '1rem',
    title: '1.75rem',
    display: 'clamp(1.6rem, 4vw, 2.25rem)',
  },
} as const
