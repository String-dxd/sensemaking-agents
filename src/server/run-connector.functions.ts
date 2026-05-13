import { createServerFn } from '@tanstack/react-start'
import { runConnectorInputSchema } from './function-schemas'

export const runConnector = createServerFn({ method: 'POST' })
  .inputValidator((raw: unknown) => runConnectorInputSchema.parse(raw))
  .handler(async ({ data }) => {
    const { runConnectorHandler } = await import('./run-connector.handler.server')
    return runConnectorHandler(data)
  })
