import { defineConfig } from 'vitest/config'
import glsl from 'vite-plugin-glsl'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [
    // Match the dev/build pipeline so engine View modules (which import .glsl
    // shader files) can be loaded in vitest. Without this plugin Rollup tries
    // to parse `varying vec2 vUv;` as JavaScript and the import errors out.
    glsl({ watch: false }),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
  ],
  test: {
    globals: true,
    environment: 'happy-dom',
    // Pin a non-Singapore zone so any test that accidentally couples the
    // device-local clock to the product's Asia/Singapore day-bucketing
    // (src/lib/entry-date.ts) fails on every machine, not just on CI.
    env: { TZ: 'America/New_York' },
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['test/ablation/reports/**', 'node_modules/**'],
  },
})
