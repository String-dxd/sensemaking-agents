import { describe, expect, it } from 'vitest'
import { checkOutputForDiagnosticLanguage, checkPayloadForDiagnosticLanguage } from '~/lib/safety'

describe('safety: diagnostic-language regex', () => {
  it('flags personality labels', () => {
    expect(checkOutputForDiagnosticLanguage('You are an extrovert.').ok).toBe(false)
    expect(checkOutputForDiagnosticLanguage('You are a perfectionist who…').ok).toBe(false)
    expect(checkOutputForDiagnosticLanguage('Your personality is...').ok).toBe(false)
  })

  it('flags identity labels', () => {
    expect(checkOutputForDiagnosticLanguage('Your true self is creative.').ok).toBe(false)
    expect(checkOutputForDiagnosticLanguage('You were born to teach.').ok).toBe(false)
  })

  it('flags ability labels', () => {
    expect(checkOutputForDiagnosticLanguage('You lack empathy.').ok).toBe(false)
    expect(checkOutputForDiagnosticLanguage("You're naturally gifted for engineering.").ok).toBe(
      false,
    )
  })

  it('does not flag descriptions of behaviour', () => {
    expect(
      checkOutputForDiagnosticLanguage('Stayed in the role for 40 minutes without swapping.').ok,
    ).toBe(true)
    expect(
      checkOutputForDiagnosticLanguage(
        'Built the arm faster blindfolded than sighted; tracked screws by hand position.',
      ).ok,
    ).toBe(true)
  })

  it('walks structured payloads and flags any string leaf', () => {
    const flagged = checkPayloadForDiagnosticLanguage({
      summary: 'fine',
      signals: [{ kind: 'inferred', text: 'You are a natural leader.' }],
      caution: 'one session',
    })
    expect(flagged.ok).toBe(false)
    expect(flagged.matches.length).toBeGreaterThan(0)
  })
})
