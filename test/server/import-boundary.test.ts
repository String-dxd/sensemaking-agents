import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const clientFacingServerFunctionFiles = [
  'confirm-diff.functions.ts',
  'counsellor-brief.functions.ts',
  'edit-wiki.functions.ts',
  'forget-diff.functions.ts',
  'forget-timeline-entry.functions.ts',
  'load-pending-review.functions.ts',
  'load-trajectory.functions.ts',
  'load-vips-pages.functions.ts',
  'load-wiki.functions.ts',
  'persist-mirror.functions.ts',
  'run-cartographer.functions.ts',
  'run-mirror.functions.ts',
  'search-past-mirrors.functions.ts',
  'transcribe-mirror.functions.ts',
  'update-mirror-review.functions.ts',
  'update-review-context.functions.ts',
]

const forbiddenImports = [
  /\.handler\.server['"]/,
  /['"]~\/db\/client['"]/,
  /['"]openai['"]/,
  /['"]@anthropic-ai\/sdk['"]/,
  /['"]@workos\/authkit-tanstack-react-start['"]/,
  /['"]@tanstack\/react-start\/server['"]/,
]

describe('client-facing server function import boundary', () => {
  it('keeps wrappers free of server-only static imports', () => {
    for (const file of clientFacingServerFunctionFiles) {
      const source = readFileSync(join(process.cwd(), 'src/server', file), 'utf8')
      for (const forbidden of forbiddenImports) {
        const hasForbiddenStaticImport = source
          .split('\n')
          .some((line) => line.startsWith('import ') && forbidden.test(line))
        expect(hasForbiddenStaticImport, `${file} must not statically import ${forbidden}`).toBe(
          false,
        )
      }
    }
  })
})
