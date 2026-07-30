import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '../..')

function source(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8')
}

describe('public route engine boundary', () => {
  it('keeps the shared root free of eager developer and onboarding tuner imports', () => {
    const root = source('src/routes/__root.tsx')

    expect(root).not.toMatch(/^import .*DevPalette/m)
    expect(root).not.toMatch(/^import .*HatchTuneHud/m)
    expect(root).not.toMatch(/^import .*student-space/m)
    expect(root).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]~\/components\/DevPalette['"]\)/)
    expect(root).toMatch(/import\.meta\.env\.DEV/)
  })

  it('mounts the hatch tuner lazily inside the authenticated app boundary', () => {
    const appLayout = source('src/routes/_app.tsx')

    expect(appLayout).not.toMatch(/^import .*HatchTuneHud/m)
    expect(appLayout).toMatch(
      /lazy\(\(\)\s*=>\s*import\(['"]~\/components\/student-space\/onboarding\/HatchTuneHud['"]\)/,
    )
    expect(appLayout).toMatch(/import\.meta\.env\.DEV/)
  })

  it('keeps the FAQ route and page free of Student Space and engine imports', () => {
    const faqSources = [
      source('src/routes/my-world.faq.tsx'),
      source('src/components/my-world-faq/MyWorldFaqPage.tsx'),
      source('src/components/my-world-faq/ProductLoop.tsx'),
      source('src/components/my-world-faq/SignalSourceStrip.tsx'),
      source('src/components/my-world-faq/QuestionField.tsx'),
    ]

    for (const faqSource of faqSources) {
      expect(faqSource).not.toMatch(/^import .*~\/engine\//m)
      expect(faqSource).not.toMatch(/^import .*student-space/m)
      expect(faqSource).not.toMatch(/^import .*three['"]/m)
      expect(faqSource).not.toContain('EngineHost')
      expect(faqSource).not.toContain('PageSurface')
      expect(faqSource).not.toContain('engine/student-space/style.css')
    }
  })

  it('keeps the public FAQ graph free of editor, database, and Runtime Cache modules', () => {
    const route = source('src/routes/my-world.faq.tsx')
    const page = source('src/components/my-world-faq/MyWorldFaqPage.tsx')
    const wrapper = source('src/server/my-world-faq-content.functions.ts')

    for (const publicSource of [route, page, wrapper]) {
      expect(publicSource).not.toMatch(/^import .*my-world-faq-editor/m)
      expect(publicSource).not.toMatch(/^import .*my-world-faq-repository/m)
      expect(publicSource).not.toMatch(/^import .*my-world-faq-public-cache/m)
      expect(publicSource).not.toMatch(/^import .*~\/db\//m)
      expect(publicSource).not.toMatch(/^import .*@vercel\/functions/m)
    }
    expect(wrapper).toMatch(
      /await import\(\s*['"]\.\/my-world-faq-content\.handler\.server['"]\s*\)/,
    )
  })

  it('keeps editor controls out of the public route module', () => {
    const route = source('src/routes/my-world.faq.tsx')
    const editorRoute = source('src/routes/my-world.faq_.edit.tsx')
    const editorFunctions = source('src/server/my-world-faq-editor.functions.ts')

    expect(route).not.toContain('MyWorldFaqEditorPage')
    expect(route).not.toContain('FaqEditorGate')
    expect(route).not.toContain('loadMyWorldFaqEditor')
    expect(editorRoute).toContain('MyWorldFaqEditorPage')
    expect(editorFunctions).not.toMatch(/^import .*my-world-faq-repository/m)
    expect(editorFunctions).toMatch(
      /import\(\s*['"]\.\/my-world-faq-editor\.handler\.server['"]\s*\)/,
    )
  })

  it('requires the loader document at every public renderer boundary', () => {
    const componentSources = [
      source('src/components/my-world-faq/MyWorldFaqPage.tsx'),
      source('src/components/my-world-faq/ProductLoop.tsx'),
      source('src/components/my-world-faq/SignalSourceStrip.tsx'),
      source('src/components/my-world-faq/QuestionField.tsx'),
    ]

    for (const componentSource of componentSources) {
      expect(componentSource).not.toContain('DEFAULT_MY_WORLD_FAQ_CONTENT')
      expect(componentSource).not.toMatch(/content\s*\?\s*:/)
    }
  })

  it('keeps protected editor code and metadata out of the built public FAQ chunk graph', () => {
    const assetsDirectory = join(REPO_ROOT, 'dist/client/assets')
    expect(
      existsSync(assetsDirectory),
      'Run `pnpm build` before this boundary test so it can inspect the emitted graph.',
    ).toBe(true)

    const assetNames = readdirSync(assetsDirectory)
    const publicEntries = assetNames.filter((name) => /^my-world\.faq-[^.]+\.js$/.test(name))
    expect(publicEntries.length).toBeGreaterThan(0)

    const graph = new Set<string>()
    const pending = [...publicEntries]
    while (pending.length > 0) {
      const name = pending.pop()
      if (!name || graph.has(name)) continue
      graph.add(name)
      const contents = readFileSync(join(assetsDirectory, name), 'utf8')
      for (const match of contents.matchAll(
        /(?:from|import)(?!\s*\()\s*["']\.\/([^"']+\.js)["']/g,
      )) {
        const dependency = match[1]
        if (dependency && assetNames.includes(dependency) && !graph.has(dependency)) {
          pending.push(dependency)
        }
      }
    }

    expect([...graph].some((name) => name.startsWith('my-world.faq_.edit-'))).toBe(false)
    expect([...graph].some((name) => name.startsWith('FaqEditorGate-'))).toBe(false)

    const emittedPublicGraph = [...graph]
      .map((name) => readFileSync(join(assetsDirectory, name), 'utf8'))
      .join('\n')
    for (const protectedMarker of [
      '__Host-my_world_faq_editor',
      'my_world_faq_editor_sessions',
      '/api/my-world/faq/editor',
      'Save & publish',
      'Unlock editor',
      'Supporting records',
      'committed-but-superseded',
      'my-world-faq-editor-security',
      'DATABASE_URL',
      'argon2',
    ]) {
      expect(emittedPublicGraph, `public graph contains ${protectedMarker}`).not.toContain(
        protectedMarker,
      )
    }
  })
})
