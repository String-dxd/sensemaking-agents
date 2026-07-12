import react from '@vitejs/plugin-react'
// Import defineConfig from 'vitest/config' (not 'vite') so the `test` field is
// natively typed without a triple-slash reference. Both this package and the
// product app are on vite 7 (unified repo-wide — see the pnpm monorepo note in
// CLAUDE.md), so this is about test-field typing, not bridging a vite version gap.
import { defineConfig } from 'vitest/config'
import { islandSavePlugin } from './server/islandSavePlugin'

// Standalone editor app. Plain Vite + React (no TanStack Start / SSR).
// A workspace member, kept on its own three.js line and its own dev port.
export default defineConfig({
  plugins: [react(), islandSavePlugin()],
  server: { port: 5180 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
