/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Isolated studio app. Plain Vite + React (no TanStack Start / SSR).
// Deliberately separate from the product app's dependency graph (its own
// three@0.185 + r3f 9 / drei 10) — see character-studio/README.md.
export default defineConfig({
  plugins: [react()],
  server: { port: 5190 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
