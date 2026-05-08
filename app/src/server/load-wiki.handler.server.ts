import { z } from 'zod'
import {
  type ConnectorOutputRow,
  getMirrorEntry,
  latestConnectorOutput,
  latestPathfinderOutput,
  listMirrorEntries,
  type MirrorEntryRow,
  type PathfinderOutputRow,
} from '~/db/queries'
import { withStudent } from '~/server/tenancy.server'

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

export function loadWikiHandler(data: LoadWikiInput): WikiSnapshot {
  const parsed = loadWikiInputSchema.parse(data)
  return withStudent(parsed.studentId, (sid) => ({
    entries: listMirrorEntries(sid),
    connector: latestConnectorOutput(sid),
    pathfinder: latestPathfinderOutput(sid),
  }))
}

export function loadWikiEntryHandler(data: LoadWikiEntryInput): WikiEntryDetail | null {
  const parsed = loadWikiEntryInputSchema.parse(data)
  return withStudent(parsed.studentId, (sid) => {
    const entry = getMirrorEntry(sid, parsed.entryId)
    if (!entry) return null
    return {
      entry,
      connector: latestConnectorOutput(sid),
      pathfinder: latestPathfinderOutput(sid),
    }
  })
}
