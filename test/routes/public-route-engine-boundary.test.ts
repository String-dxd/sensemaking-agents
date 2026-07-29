import { readFileSync } from 'node:fs'
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
      source('src/components/my-world-faq/GuardrailLedgerPreview.tsx'),
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

  it('requires the loader document at every public renderer boundary', () => {
    const componentSources = [
      source('src/components/my-world-faq/MyWorldFaqPage.tsx'),
      source('src/components/my-world-faq/ProductLoop.tsx'),
      source('src/components/my-world-faq/SignalSourceStrip.tsx'),
      source('src/components/my-world-faq/GuardrailLedgerPreview.tsx'),
      source('src/components/my-world-faq/QuestionField.tsx'),
    ]

    for (const componentSource of componentSources) {
      expect(componentSource).not.toContain('DEFAULT_MY_WORLD_FAQ_CONTENT')
      expect(componentSource).not.toMatch(/content\s*\?\s*:/)
    }
  })
})
