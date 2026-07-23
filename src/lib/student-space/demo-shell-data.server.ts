import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { VipsContextType } from '~/agents/tools/schemas'
import { sgDateKey } from '~/lib/entry-date'

export interface StudentSpaceShellIdentity {
  name: string
  className: string
  avatarDataUrl: string | null
}

export interface StudentSpaceShellCalendarEvent {
  id: string
  label: string
  kind: 'class' | 'cca' | 'note'
  date: string
}

export interface StudentSpaceShellTeacherLetter {
  id: string
  from: string
  subject: string
  body: string
  sentAt: string
  read: boolean
}

export interface StudentSpaceShellData {
  identity: StudentSpaceShellIdentity
  calendarEvents: StudentSpaceShellCalendarEvent[]
  teacherLetters: StudentSpaceShellTeacherLetter[]
}

interface SeedCorpus {
  students?: SeedStudent[]
}

interface SeedStudent {
  student_id?: string
  profile?: {
    name_handle?: string
    year_level?: string
    notes_for_review?: string
  }
  reflections?: Array<{
    context_type?: VipsContextType
    transcript?: string
    created_at?: string
  }>
}

const SEED_PATH = resolve(process.cwd(), 'test/ablation/fixtures/seed-multistudent.json')

export function loadStudentSpaceShellData(studentId: string): StudentSpaceShellData | null {
  const student = loadSeedStudent(studentId)
  if (!student?.profile?.name_handle) return null

  const identity = parseIdentity(student.profile)
  const reflections = (student.reflections ?? []).filter(hasCreatedAt)

  return {
    identity,
    calendarEvents: buildCalendarEvents(studentId, reflections),
    // Letters come from the engine seed (LETTERS_SEED) only — the two
    // teacher-prompt letters (camp, career fair). The shell no longer
    // generates extra pattern/first-thread letters.
    teacherLetters: [],
  }
}

function loadSeedStudent(studentId: string): SeedStudent | null {
  try {
    const corpus = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedCorpus
    return corpus.students?.find((student) => student.student_id === studentId) ?? null
  } catch {
    return null
  }
}

function parseIdentity(profile: NonNullable<SeedStudent['profile']>): StudentSpaceShellIdentity {
  const parsed = parseNameHandle(profile.name_handle ?? 'Me')
  return {
    name: parsed.name,
    className: parsed.detail ?? profile.year_level ?? '',
    avatarDataUrl: null,
  }
}

function buildCalendarEvents(
  studentId: string,
  reflections: Array<{ context_type?: VipsContextType; created_at: string }>,
): StudentSpaceShellCalendarEvent[] {
  const school = firstReflectionDate(reflections, 'school') ?? reflections[0]?.created_at
  const civicOrHobby =
    firstReflectionDate(reflections, 'civic') ??
    firstReflectionDate(reflections, 'hobby') ??
    reflections[1]?.created_at
  const latest = reflections.at(-1)?.created_at

  return [
    school
      ? {
          id: `demo-shell:${studentId}:school-checkpoint`,
          label: 'Form teacher check-in',
          kind: 'class',
          date: toEntryDate(school),
        }
      : null,
    civicOrHobby
      ? {
          id: `demo-shell:${studentId}:cca-reflection`,
          label: 'CCA / VIA reflection window',
          kind: 'cca',
          date: toEntryDate(civicOrHobby),
        }
      : null,
    latest
      ? {
          id: `demo-shell:${studentId}:pathway-note`,
          label: 'Pathway planning note',
          kind: 'note',
          date: toEntryDate(latest),
        }
      : null,
  ].filter(Boolean) as StudentSpaceShellCalendarEvent[]
}

function parseNameHandle(value: string): { name: string; detail: string | null } {
  const match = value.match(/^(.+?)\s*\((.+)\)$/)
  if (!match) return { name: value.trim(), detail: null }
  return {
    name: match[1]?.trim() || value.trim(),
    detail: match[2]?.trim() || null,
  }
}

function firstReflectionDate(
  reflections: Array<{ context_type?: VipsContextType; created_at: string }>,
  contextType: VipsContextType,
): string | null {
  return (
    reflections.find((reflection) => reflection.context_type === contextType)?.created_at ?? null
  )
}

function hasCreatedAt(reflection: {
  context_type?: VipsContextType
  transcript?: string
  created_at?: string
}): reflection is { context_type?: VipsContextType; transcript?: string; created_at: string } {
  return (
    typeof reflection.created_at === 'string' && !Number.isNaN(Date.parse(reflection.created_at))
  )
}

function toEntryDate(value: string): string {
  return sgDateKey(value) ?? '1970-01-01'
}
