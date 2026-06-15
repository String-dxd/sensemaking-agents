/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone editor app. Plain Vite + React (no TanStack Start / SSR).
// Isolated from the product app: its own deps, its own port.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
