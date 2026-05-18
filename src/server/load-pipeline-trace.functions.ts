import { createServerFn } from '@tanstack/react-start'
import { loadPipelineTraceInputSchema } from './function-schemas'
import type { PipelineTraceResult } from './load-pipeline-trace.types'

/**
 * Developer-only — returns a joined trace of the agent pipeline for the
 * active student. See `load-pipeline-trace.handler.server.ts` for shape.
 */
export const loadPipelineTrace = createServerFn({ method: 'GET' })
  .inputValidator((raw: unknown) => loadPipelineTraceInputSchema.parse(raw))
  .handler(async (): Promise<PipelineTraceResult> => {
    const { loadPipelineTraceHandler } = await import('./load-pipeline-trace.handler.server')
    return loadPipelineTraceHandler()
  })
