import { createServerFn } from '@tanstack/react-start'

/**
 * Developer-only — returns a joined trace of the agent pipeline for the
 * active student. See `load-pipeline-trace.handler.server.ts` for shape.
 */
export const loadPipelineTrace = createServerFn({ method: 'GET' }).handler(async () => {
  const { loadPipelineTraceHandler } = await import('./load-pipeline-trace.handler.server')
  return loadPipelineTraceHandler()
})
