/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Standalone studio app. Plain Vite + React (no TanStack Start / SSR).
// Isolated from the product app for DEPENDENCIES (its own three@0.171), but it
// serves the product's canonical static assets so it loads the REAL rigged
// bird: `publicDir` points at the repo-root `public/`, so `/birds/*.glb` and
// `/draco/` resolve to the same files the engine ships — no duplicated GLB.
export default defineConfig({
  plugins: [react()],
  publicDir: '../public',
  server: { port: 5181 },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
