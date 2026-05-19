import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe('Postgres transaction query serialization', () => {
  it('does not fan out VIPS dimension reads on one transaction client', () => {
    for (const path of [
      'src/agents/context/index.ts',
      'src/server/auto-connector.handler.server.ts',
      'src/server/run-cartographer.handler.server.ts',
      'src/server/load-pipeline-trace.handler.server.ts',
    ]) {
      const text = source(path)
      expect(text, path).not.toMatch(
        /Promise\.all(?:Settled)?\(\s*[\s\S]{0,120}VIPS_DIMENSIONS\.map/,
      )
    }
  })

  it('schedules Cartographer memory appends outside the request path', () => {
    const text = source('src/server/run-cartographer.handler.server.ts')
    expect(text).toMatch(/scheduleCartographerMemoryAppends\(\{/)
    expect(text).toMatch(/waitUntil\(task\)/)
    expect(text).not.toMatch(/const pedagogicalSummary[\s\S]{0,600}await appendMemoryBestEffort/)
    expect(text).not.toMatch(/Promise\.all\(\s*\[\s*appendMemoryBestEffort/)
  })

  it('does not parallelize mixed mirror/proposed-diff reads on one transaction client', () => {
    expect(source('src/db/queries.ts')).not.toMatch(/Promise\.all\(\s*\[\s*listMirrorEntriesInner/)
  })
})
