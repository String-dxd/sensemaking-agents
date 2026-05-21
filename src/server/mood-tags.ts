import { type Mood, MoodSchema } from '~/agents/tools/schemas'

export const MIRROR_MOOD_TAG_PREFIX = 'mood:' as const

export function mirrorMoodTag(mood: Mood): string {
  return `${MIRROR_MOOD_TAG_PREFIX}${mood}`
}

export function moodFromMirrorTags(tags: readonly string[]): Mood | null {
  for (const tag of tags) {
    if (!tag.startsWith(MIRROR_MOOD_TAG_PREFIX)) continue
    const parsed = MoodSchema.safeParse(tag.slice(MIRROR_MOOD_TAG_PREFIX.length))
    if (parsed.success) return parsed.data
  }
  return null
}
