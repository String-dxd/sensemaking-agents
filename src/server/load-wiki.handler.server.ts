import { z } from 'zod'
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

export const loadWikiInputSchema = z.object({
  studentId: z.string().min(1),
})

export const loadWikiEntryInputSchema = z.object({
  studentId: z.string().min(1),
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
  const parsed = loadWikiInputSchema.parse(data)
  return withStudent(parsed.studentId, async (ctx) => ({
    entries: await listMirrorEntries(parsed.studentId, { ctx }),
    connector: await latestConnectorOutput(parsed.studentId, { ctx }),
    pathfinder: await latestPathfinderOutput(parsed.studentId, { ctx }),
  }))
}

export async function loadWikiEntryHandler(
  data: LoadWikiEntryInput,
): Promise<WikiEntryDetail | null> {
  const parsed = loadWikiEntryInputSchema.parse(data)
  return withStudent(parsed.studentId, async (ctx) => {
    const entry = await getMirrorEntry(parsed.studentId, parsed.entryId, { ctx })
    if (!entry) return null
    return {
      entry,
      connector: await latestConnectorOutput(parsed.studentId, { ctx }),
      pathfinder: await latestPathfinderOutput(parsed.studentId, { ctx }),
    }
  })
}
