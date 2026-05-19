import { type MirrorOutputDraft, MirrorOutputSchema } from '~/agents/schemas'

export function parseMirrorRealtimeText(text: string): MirrorOutputDraft | null {
  for (const candidate of candidateJsonStrings(text)) {
    try {
      const parsed = JSON.parse(candidate)
      const result = MirrorOutputSchema.safeParse(parsed)
      if (result.success) return result.data
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

function candidateJsonStrings(text: string): string[] {
  const trimmed = text.trim()
  const candidates = [trimmed]
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu)
  if (fenced?.[1]) candidates.push(fenced[1].trim())
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace)
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1))
  return Array.from(new Set(candidates.filter((candidate) => candidate.length > 0)))
}
