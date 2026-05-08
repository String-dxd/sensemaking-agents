import { defineConfig } from '@trigger.dev/sdk/v3'

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_local_dev',
  runtime: 'node',
  logLevel: 'log',
  maxDuration: 600,
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 1 },
  },
  dirs: ['./trigger'],
})
