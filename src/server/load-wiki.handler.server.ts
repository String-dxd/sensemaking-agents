import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import {
  getMirrorEntry,
  listMirrorEntries,
  listVipsTimelineEntriesByReflectionId,
  type MirrorEntryRow,
  type VipsTimelineEntryRow,
} from '~/db/queries'
import {
  type LoadWikiEntryInput,
  type LoadWikiInput,
  loadWikiEntryInputSchema,
  loadWikiInputSchema,
} from './function-schemas'

export interface WikiSnapshot {
  entries: MirrorEntryRow[]
}

export interface WikiEntryDetail {
  entry: MirrorEntryRow
  connected_vips_entries: VipsTimelineEntryRow[]
}

export async function loadWikiHandler(data: LoadWikiInput): Promise<WikiSnapshot> {
  loadWikiInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => ({
    entries: await listMirrorEntries(studentId, { ctx, limit: null }),
  }))
}

export interface LoadWikiEntryDeps {
  requireContext?: typeof requireCounselorContext
  withStudent?: typeof withStudent
  getMirrorEntry?: typeof getMirrorEntry
  listVipsTimelineEntriesByReflectionId?: typeof listVipsTimelineEntriesByReflectionId
}

export async function loadWikiEntryHandler(
  data: LoadWikiEntryInput,
  deps: LoadWikiEntryDeps = {},
): Promise<WikiEntryDetail | null> {
  const parsed = loadWikiEntryInputSchema.parse(data)
  const { studentId } = await (deps.requireContext ?? requireCounselorContext)()
  const withStudentFn = deps.withStudent ?? withStudent
  const getMirrorEntryFn = deps.getMirrorEntry ?? getMirrorEntry
  const listConnectedEntries =
    deps.listVipsTimelineEntriesByReflectionId ?? listVipsTimelineEntriesByReflectionId
  return withStudentFn(studentId, async (ctx) => {
    const entry = await getMirrorEntryFn(studentId, parsed.entryId, { ctx })
    if (!entry) return null
    return {
      entry,
      connected_vips_entries: await listConnectedEntries(studentId, entry.id, {
        ctx,
      }),
    }
  })
}
