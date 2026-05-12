import { z } from 'zod'
import { requireCounselorContext } from '~/auth/identity'
import { withStudent } from '~/db/client'
import {
  type ConnectorOutputRow,
  getMirrorEntry,
  latestConnectorOutput,
  latestPathfinderOutput,
  listMirrorEntries,
  type MirrorEntryRow,
  type PathfinderOutputRow,
} from '~/db/queries'

export const loadWikiInputSchema = z.object({})

export const loadWikiEntryInputSchema = z.object({
  entryId: z.number().int().positive(),
})

export type LoadWikiInput = z.output<typeof loadWikiInputSchema>
export type LoadWikiEntryInput = z.output<typeof loadWikiEntryInputSchema>

export interface WikiSnapshot {
  entries: MirrorEntryRow[]
  connector: ConnectorOutputRow | null
  pathfinder: PathfinderOutputRow | null
}

export interface WikiEntryDetail {
  entry: MirrorEntryRow
  connector: ConnectorOutputRow | null
  pathfinder: PathfinderOutputRow | null
}

export async function loadWikiHandler(data: LoadWikiInput): Promise<WikiSnapshot> {
  loadWikiInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => ({
    entries: await listMirrorEntries(studentId, { ctx }),
    connector: await latestConnectorOutput(studentId, { ctx }),
    pathfinder: await latestPathfinderOutput(studentId, { ctx }),
  }))
}

export async function loadWikiEntryHandler(
  data: LoadWikiEntryInput,
): Promise<WikiEntryDetail | null> {
  const parsed = loadWikiEntryInputSchema.parse(data)
  const { studentId } = await requireCounselorContext()
  return withStudent(studentId, async (ctx) => {
    const entry = await getMirrorEntry(studentId, parsed.entryId, { ctx })
    if (!entry) return null
    return {
      entry,
      connector: await latestConnectorOutput(studentId, { ctx }),
      pathfinder: await latestPathfinderOutput(studentId, { ctx }),
    }
  })
}
