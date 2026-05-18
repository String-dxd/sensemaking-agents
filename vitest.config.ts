import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.json'] })],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: [
      'test/ablation/reports/**',
      'node_modules/**',
      // Quarantined while their source components / modules are dormant
      // (replaced by the Student Space engine port). Tests are retained so
      // we can delete them alongside the source files in the cleanup
      // milestone — see plan
      // docs/plans/2026-05-18-001-feat-port-student-space-shell-plan.md.
      'test/world/**',
      'test/components/FloatingWorldActions.test.tsx',
      'test/components/WorldStage.test.tsx',
      'test/components/WorldHud.test.tsx',
      'test/components/WorldScene.test.tsx',
    ],
  },
})
