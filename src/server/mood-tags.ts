import { type Mood, MoodSchema } from '~/agents/tools/schemas'

export const MIRROR_MOOD_TAG_PREFIX = 'mood:' as const

export function mirrorMoodTag(mood: Mood): string {
  return `${MIRROR_MOOD_TAG_PREFIX}${mood}`
}

// Photo attachment rides the same tag lane — the mirror row has no image
// column. The value is a public asset path or data URL.
export const MIRROR_PHOTO_TAG_PREFIX = 'photo:' as const

export function mirrorPhotoTag(url: string): string {
  return `${MIRROR_PHOTO_TAG_PREFIX}${url}`
}

export function photoFromMirrorTags(tags: readonly string[]): string | null {
  for (const tag of tags) {
    if (!tag.startsWith(MIRROR_PHOTO_TAG_PREFIX)) continue
    const url = tag.slice(MIRROR_PHOTO_TAG_PREFIX.length).trim()
    if (url.length > 0) return url
  }
  return null
}

export function moodFromMirrorTags(tags: readonly string[]): Mood | null {
  for (const tag of tags) {
    if (!tag.startsWith(MIRROR_MOOD_TAG_PREFIX)) continue
    const parsed = MoodSchema.safeParse(tag.slice(MIRROR_MOOD_TAG_PREFIX.length))
    if (parsed.success) return parsed.data
  }
  return null
}
