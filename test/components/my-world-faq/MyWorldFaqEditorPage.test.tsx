import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MyWorldFaqEditorPage,
  setEditorProtectedRootVisibility,
} from '~/components/my-world-faq/editor/MyWorldFaqEditorPage'
import {
  addTeamFaqQuestion,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  FAQ_EDITABLE_FIELDS,
  FAQ_EDITABLE_PATHS,
  FAQ_EDITORIAL_FIELD_LIMITS,
} from '~/data/my-world-faq'
import type {
  MyWorldFaqEditorBaseSnapshot,
  MyWorldFaqEditorLoaderData,
  MyWorldFaqEditorSessionState,
  MyWorldFaqRevisionMetadata,
  PublishMyWorldFaqEditorRequest,
} from '~/server/my-world-faq-editor.functions'
import { MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES } from '~/server/my-world-faq-editor.functions'
import { buildValidPublishRequestAtByteLength } from '../../data/my-world-faq-publish-envelope.fixture'

const checkSessionMock = vi.hoisted(() => vi.fn())
const loadEditorMock = vi.hoisted(() => vi.fn())
const loadHistoryMock = vi.hoisted(() => vi.fn())
const loadPreviewMock = vi.hoisted(() => vi.fn())
const assignLocationMock = vi.fn()
let originalAssignLocation: typeof window.location.assign

vi.mock('~/server/my-world-faq-editor.functions', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/server/my-world-faq-editor.functions')>()
  return {
    ...original,
    checkMyWorldFaqEditorSession: checkSessionMock,
    loadMyWorldFaqEditor: loadEditorMock,
    loadMyWorldFaqRevisionHistory: loadHistoryMock,
    loadMyWorldFaqRevisionPreview: loadPreviewMock,
  }
})

const READY_DATA = {
  status: 'ready',
  identity: {
    displayName: 'Ari',
    idleExpiresAt: '2099-07-30T00:00:00.000Z',
    absoluteExpiresAt: '2099-07-30T08:00:00.000Z',
  },
  base: {
    head: {
      revisionId: '11111111-1111-4111-8111-111111111111',
      version: 4,
      digest: 'a'.repeat(64),
    },
    document: DEFAULT_MY_WORLD_FAQ_CONTENT,
    savedByName: 'Sam',
    createdAt: '2026-07-29T00:00:00.000Z',
  },
  manifest: {
    fields: FAQ_EDITABLE_FIELDS,
    limits: FAQ_EDITORIAL_FIELD_LIMITS,
  },
} satisfies Extract<MyWorldFaqEditorLoaderData, { status: 'ready' }>

function snapshot(
  version: number,
  document = DEFAULT_MY_WORLD_FAQ_CONTENT,
): MyWorldFaqEditorBaseSnapshot {
  return {
    head: {
      revisionId: `${String(version).padStart(8, '0')}-1111-4111-8111-111111111111`,
      version,
      digest: version.toString(16).padStart(64, '0'),
    },
    document,
    savedByName: 'Ari',
    createdAt: `2026-07-${String(20 + version).padStart(2, '0')}T00:00:00.000Z`,
  }
}

function publishSuccess(
  committed: MyWorldFaqEditorBaseSnapshot,
  options: {
    live?: MyWorldFaqEditorBaseSnapshot
    outcome?: 'committed' | 'committed-but-superseded'
    resilience?: 'healthy' | 'degraded'
  } = {},
) {
  return Response.json({
    ok: true,
    outcome: options.outcome ?? 'committed',
    committed,
    live: options.live ?? committed,
    resilience: options.resilience ?? 'healthy',
    warnings: [],
  })
}

function revisionMetadata(version: number): MyWorldFaqRevisionMetadata {
  const revision = snapshot(version)
  return {
    ...revision.head,
    schemaVersion: 1,
    structureVersion: 1,
    attributionKind: 'self-declared',
    savedByName: version === 3 ? 'Jo' : 'Ari',
    createdAt: revision.createdAt,
    restoredFromRevisionId: null,
  }
}

function revisionPreview(version: number, document = DEFAULT_MY_WORLD_FAQ_CONTENT) {
  const revision = snapshot(version, document)
  return {
    ...revision,
    schemaVersion: 1,
    structureVersion: 1,
    attributionKind: 'self-declared' as const,
    restoredFromRevisionId: null,
  }
}

function restoreSuccess(
  committed: MyWorldFaqEditorBaseSnapshot,
  options: {
    live?: MyWorldFaqEditorBaseSnapshot
    outcome?: 'committed' | 'committed-but-superseded'
    resilience?: 'healthy' | 'degraded'
  } = {},
) {
  return Response.json({
    ok: true,
    outcome: options.outcome ?? 'committed',
    committed,
    live: options.live ?? committed,
    resilience: options.resilience ?? 'healthy',
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('MyWorldFaqEditorPage', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    Object.defineProperty(window.location, 'assign', {
      configurable: true,
      writable: true,
      value: originalAssignLocation,
    })
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    originalAssignLocation = window.location.assign
    Object.defineProperty(window.location, 'assign', {
      configurable: true,
      writable: true,
      value: assignLocationMock,
    })
    assignLocationMock.mockClear()
    checkSessionMock.mockReset()
    loadEditorMock.mockReset()
    loadHistoryMock.mockReset()
    loadPreviewMock.mockReset()
    checkSessionMock.mockResolvedValue({
      status: 'ready',
      identity: {
        displayName: 'Ari',
        idleExpiresAt: '2099-07-30T00:00:00.000Z',
        absoluteExpiresAt: '2099-07-30T08:00:00.000Z',
      },
    })
    loadEditorMock.mockResolvedValue(READY_DATA)
    loadHistoryMock.mockResolvedValue({
      status: 'ready',
      items: [revisionMetadata(3)],
      nextBeforeVersion: null,
    })
    loadPreviewMock.mockResolvedValue({
      status: 'ready',
      revision: revisionPreview(3),
    })
  })

  it('renders exactly one logical control for every editable manifest path', async () => {
    const user = userEvent.setup()
    const observedPaths = new Set<string>()
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    const collectVisibleEditorControls = () => {
      const paths = [...document.querySelectorAll<HTMLElement>('[data-editor-path]')].map(
        (control) => control.dataset.editorPath ?? '',
      )
      expect(paths.every(Boolean)).toBe(true)
      expect(new Set(paths).size).toBe(paths.length)
      for (const path of paths) observedPaths.add(path)
    }

    collectVisibleEditorControls()

    await user.click(screen.getByRole('button', { name: 'Supporting records' }))
    collectVisibleEditorControls()
    await user.click(
      within(screen.getByRole('dialog', { name: 'Supporting records' })).getByRole('button', {
        name: 'Close supporting records',
      }),
    )

    const evidenceDialogCount = screen.getAllByRole('button', {
      name: 'Evidence and limits',
    }).length
    expect(evidenceDialogCount).toBe(DEFAULT_MY_WORLD_FAQ_CONTENT.questions.length)

    for (let index = 0; index < evidenceDialogCount; index += 1) {
      const trigger = screen.getAllByRole('button', { name: 'Evidence and limits' })[index]
      if (!trigger) throw new Error(`Evidence trigger ${index} was not rendered.`)
      await user.click(trigger)
      const dialog = screen.getByRole('dialog')
      collectVisibleEditorControls()
      await user.click(within(dialog).getByRole('button', { name: 'Close evidence' }))
    }

    expect([...observedPaths].sort()).toEqual([...FAQ_EDITABLE_PATHS].sort())
  }, 60_000)

  it('isolates editor controls from the display typography around them', () => {
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    const control = document.querySelector<HTMLElement>('[data-editor-path="page.hero.heading"]')
    const field = control?.parentElement

    expect(field).toHaveClass(
      'font-sans',
      'text-sm',
      'leading-normal',
      'tracking-normal',
      'normal-case',
      'not-italic',
      'whitespace-normal',
      '[text-wrap:wrap]',
    )
  })

  it('keeps the sticky editor toolbar below portalled dialogs', () => {
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    const toolbar = screen.getByText('Editing').closest('.sticky')
    expect(toolbar).toHaveClass('z-40')
    expect(toolbar).not.toHaveClass('z-50')
  })

  it('makes published versions and undo discoverable before a teammate publishes', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Versions & undo' })).toBeEnabled()
    expect(
      screen.getByText('Publishing updates the live FAQ immediately and saves a new version.'),
    ).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    expect(
      within(dialog).getByText(
        'Every publish is saved here. Preview an earlier version, then restore it as a new live version.',
      ),
    ).toBeVisible()
  })

  it('renders and edits question fields discovered from a dynamic base document', () => {
    const questionId = 'team-99999999-9999-4999-8999-999999999999'
    const displayedQuestion = 'How will the team decide whether this question is answered?'
    const dynamicDocument = addTeamFaqQuestion(structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT), {
      id: questionId,
      clusterId: 'evidence-next-decision',
      displayedQuestion,
      shortAnswer:
        'The team will review product evidence, research limits, student feedback, and unresolved risks before changing this working answer or treating it as settled.',
      detailedAnswer:
        'This added question remains a working team response until its claims, evidence, and limitations have been reviewed.',
      limitations:
        'The review owner, evidence threshold, and decision date have not yet been confirmed.',
      reviewDate: '2026-07-30',
    })
    const data = {
      ...READY_DATA,
      identity: {
        ...READY_DATA.identity,
        idleExpiresAt: '2099-07-30T00:00:00.000Z',
        absoluteExpiresAt: '2099-07-30T08:00:00.000Z',
      },
      base: {
        ...READY_DATA.base,
        document: dynamicDocument,
      },
      // A loader from an older deployment can still send only the seed manifest.
      // The editor must derive question fields from its actual working document.
      manifest: {
        ...READY_DATA.manifest,
        fields: FAQ_EDITABLE_FIELDS,
      },
    } satisfies Extract<MyWorldFaqEditorLoaderData, { status: 'ready' }>

    render(<MyWorldFaqEditorPage data={data} onSessionStateChanged={() => undefined} />)

    const question = screen.getByDisplayValue(displayedQuestion)
    expect(question).toHaveAttribute(
      'data-editor-path',
      `questions.${questionId}.displayedQuestion`,
    )
    expect(screen.getByText('0 changes')).toBeInTheDocument()

    fireEvent.change(question, {
      target: { value: 'How will the team decide when this question is answered?' },
    })
    expect(screen.getByText('1 change')).toBeInTheDocument()
  })

  it('adds a structured question and includes it in the published document', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as PublishMyWorldFaqEditorRequest
      return publishSuccess(snapshot(5, request.document))
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Add question' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a question' })
    fireEvent.change(within(dialog).getByLabelText('Topic'), {
      target: { value: 'evidence-next-decision' },
    })
    fireEvent.change(within(dialog).getByLabelText('Question'), {
      target: { value: 'How will the team decide whether this answer is ready?' },
    })
    fireEvent.change(within(dialog).getByLabelText('Short answer'), {
      target: {
        value:
          'We are documenting the current design, the evidence behind it, and the questions the team still needs to test before treating this answer as settled.',
      },
    })
    fireEvent.change(within(dialog).getByLabelText('Detailed answer'), {
      target: {
        value:
          'The team will review the design rationale, field signals and research limits before publishing a stronger claim.',
      },
    })
    fireEvent.change(within(dialog).getByLabelText('What still needs checking?'), {
      target: {
        value: 'The evidence threshold, review owner and decision date still need to be agreed.',
      },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Add question' }))

    expect(screen.queryByRole('dialog', { name: 'Add a question' })).not.toBeInTheDocument()
    expect(
      screen.getByDisplayValue('How will the team decide whether this answer is ready?'),
    ).toHaveAttribute(
      'data-editor-path',
      expect.stringMatching(/^questions\.team-[^.]+\.displayedQuestion$/),
    )
    fireEvent.change(
      screen.getByDisplayValue('How will the team decide whether this answer is ready?'),
      {
        target: { value: 'How will the team decide whether this answer is ready now?' },
      },
    )
    expect(screen.getByText('7 changes')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save & publish' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Published' })).toBeDisabled())

    const [, init] = fetchMock.mock.calls[0] ?? []
    const request = JSON.parse(String(init?.body)) as PublishMyWorldFaqEditorRequest
    const addedQuestion = request.document.questions.at(-1)
    expect(addedQuestion).toMatchObject({
      id: expect.stringMatching(
        /^team-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
      clusterId: 'evidence-next-decision',
      title: 'How will the team decide whether this answer is ready now?',
      displayedQuestion: 'How will the team decide whether this answer is ready now?',
      review: {
        status: 'draft-awaiting-human-review',
        reviewerRole: 'My World team',
      },
      blocks: [
        expect.objectContaining({
          kind: 'unknown',
          label: 'Team check',
          sourceIds: [],
          provenanceIds: [],
          guardrailIds: [],
        }),
      ],
    })
  })

  it('keeps an incomplete new question in the dialog instead of changing the FAQ', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)
    const initialQuestionCount = screen.getAllByTestId('faq-editor-question-card').length

    await user.click(screen.getByRole('button', { name: 'Add question' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a question' })
    fireEvent.change(within(dialog).getByLabelText('Topic'), {
      target: { value: 'human-connection' },
    })
    fireEvent.change(within(dialog).getByLabelText('Question'), {
      target: { value: 'Could this replace family time?' },
    })
    fireEvent.change(within(dialog).getByLabelText('Short answer'), {
      target: { value: 'Not enough.' },
    })
    fireEvent.change(within(dialog).getByLabelText('Detailed answer'), {
      target: { value: 'This needs a careful answer.' },
    })
    fireEvent.change(within(dialog).getByLabelText('What still needs checking?'), {
      target: { value: 'We still need evidence.' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Add question' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Use 20–45 words.')
    expect(screen.getByText('0 changes')).toBeInTheDocument()
    expect(screen.getAllByTestId('faq-editor-question-card')).toHaveLength(initialQuestionCount)
  })

  it('edits page and card copy in context with stable dirty counts', async () => {
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    expect(screen.getByText('Ari')).toBeInTheDocument()
    expect(screen.getByText('Version 4')).toBeInTheDocument()
    expect(screen.getByText('0 changes')).toBeInTheDocument()

    const heroHeading = screen.getByLabelText('Hero heading')
    fireEvent.change(heroHeading, { target: { value: 'A careful place to reflect' } })
    expect(screen.getByText('1 change')).toBeInTheDocument()

    const firstQuestionCard = screen.getAllByTestId('faq-editor-question-card')[0]
    if (!firstQuestionCard) throw new Error('Editor question card was not rendered.')
    const question = within(firstQuestionCard).getByLabelText('Question')
    fireEvent.change(question, {
      target: { value: `${(question as HTMLTextAreaElement).value} Updated` },
    })
    expect(screen.getByText('2 changes')).toBeInTheDocument()

    expect(
      firstQuestionCard.querySelector('button input, button textarea, a input, a textarea'),
    ).toBeNull()
  }, 60_000)

  it('exposes evidence and supporting records without editing locked relationships', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Supporting records' }))
    const records = screen.getByRole('dialog', { name: 'Supporting records' })
    expect(within(records).getAllByLabelText('Source title').length).toBeGreaterThan(0)
    expect(within(records).getAllByLabelText('Guardrail title').length).toBeGreaterThan(0)
    expect(within(records).getAllByLabelText('Text alternative').length).toBeGreaterThan(0)
    expect(within(records).queryByLabelText(/source ids/i)).not.toBeInTheDocument()
    expect(within(records).queryByLabelText(/guardrail state/i)).not.toBeInTheDocument()
    await user.click(within(records).getByRole('button', { name: 'Close supporting records' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Supporting records' })).not.toBeInTheDocument(),
    )

    const evidenceTrigger = screen.getAllByRole('button', { name: 'Evidence and limits' })[0]
    if (!evidenceTrigger) throw new Error('Evidence editor trigger was not rendered.')
    await user.click(evidenceTrigger)
    const evidence = screen.getByRole('dialog')
    expect(within(evidence).getAllByLabelText('Evidence heading').length).toBeGreaterThan(0)
    expect(within(evidence).getAllByLabelText('Population context').length).toBeGreaterThan(0)
    expect(within(evidence).queryByLabelText(/review status/i)).not.toBeInTheDocument()
  }, 60_000)

  it('warns before logout when the working copy is dirty', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'A changed title' },
    })
    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('suppresses beforeunload and hides protected copy before confirmed logout revocation', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => undefined))
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'A changed title' },
    })
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))

    const protectedRoot = screen.getByTestId('faq-editor-protected-root')
    expect(protectedRoot).toHaveAttribute('hidden')
    expect(protectedRoot).toHaveProperty('inert', true)
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(false)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/my-world/faq/editor/logout',
      expect.objectContaining({ method: 'POST' }),
    )
  }, 20_000)

  it('opens hidden validation destinations and focuses their invalid controls', async () => {
    const user = userEvent.setup()
    const documentWithIssues = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    const source = documentWithIssues.sources[0]
    const question = documentWithIssues.questions[0]
    const block = question?.blocks[0]
    const preview = documentWithIssues.ledgerPreview[0]
    const previewGuardrail = documentWithIssues.guardrails.find(
      (item) => item.id === preview?.guardrailId,
    )
    if (!source || !question || !block || !previewGuardrail) {
      throw new Error('FAQ fixture is incomplete.')
    }
    source.title = ''
    block.heading = ''
    previewGuardrail.title = ''
    const data = {
      ...READY_DATA,
      base: { ...READY_DATA.base, document: documentWithIssues },
    }
    render(<MyWorldFaqEditorPage data={data} onSessionStateChanged={() => undefined} />)

    await user.click(
      screen.getByRole('button', {
        name: new RegExp(`sources\\.${source.id}\\.title`),
      }),
    )
    const records = await screen.findByRole('dialog', { name: 'Supporting records' })
    const sourceTitle = within(records).getAllByLabelText('Source title')[0]
    await waitFor(() => expect(sourceTitle).toHaveFocus())
    expect(sourceTitle?.closest('details')).toHaveAttribute('open')
    await user.click(within(records).getByRole('button', { name: 'Close supporting records' }))

    /* A guardrail in the ledger preview used to be edited inline on the page, so this used to
       assert the opposite: focus lands on the page and the dialog stays shut. The ledger section
       was removed on 2026-07-30, so every guardrail is now reached the same way as any other
       supporting record — which is the point worth asserting, because a previewed guardrail
       being a special case is exactly what has stopped being true. */
    await user.click(
      screen.getByRole('button', {
        name: new RegExp(`guardrails\\.${previewGuardrail.id}\\.title`),
      }),
    )
    const guardrailRecords = await screen.findByRole('dialog', { name: 'Supporting records' })
    const guardrailTitle = guardrailRecords.querySelector<HTMLElement>(
      `[data-editor-path="guardrails.${previewGuardrail.id}.title"]`,
    )
    await waitFor(() => expect(guardrailTitle).toHaveFocus())
    expect(guardrailTitle?.closest('details')).toHaveAttribute('open')
    await user.click(
      within(guardrailRecords).getByRole('button', { name: 'Close supporting records' }),
    )

    await user.click(
      screen.getByRole('button', {
        name: new RegExp(`questions\\.${question.id}\\.blocks\\.${block.id}\\.heading`),
      }),
    )
    const evidence = await screen.findByTestId('faq-evidence-details')
    const evidenceHeading = evidence.querySelector<HTMLElement>(
      `[data-editor-path="questions.${question.id}.blocks.${block.id}.heading"]`,
    )
    await waitFor(() => expect(evidenceHeading).toHaveFocus())
  }, 15_000)

  it('gates a BFCache-restored expired session without unmounting the draft and resumes it', async () => {
    const user = userEvent.setup()
    const onSessionStateChanged = vi.fn()
    checkSessionMock.mockResolvedValueOnce({ status: 'locked' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true }))
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={onSessionStateChanged} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft survives re-auth' },
    })
    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const history = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(history).getByRole('button', { name: /Version 3/ }))
    await user.click(within(history).getByRole('button', { name: 'Discard draft and reload' }))
    const discardDialog = screen.getByRole('alertdialog', {
      name: 'Discard your draft and reload?',
    })
    expect(screen.getByTestId('faq-editor-protected-portal-host')).toContainElement(discardDialog)
    fireEvent(window, new Event('pagehide'))
    expect(screen.queryByRole('dialog', { name: 'Versions & undo' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('alertdialog', { name: 'Discard your draft and reload?' }),
    ).not.toBeInTheDocument()
    const pageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(pageShow, 'persisted', { value: true })
    fireEvent(window, pageShow)

    const overlay = await screen.findByTestId('faq-editor-access-overlay')
    expect(screen.getByRole('dialog', { name: 'Edit the My World FAQ' })).toBe(overlay)
    expect(within(overlay).getByRole('heading', { name: 'Edit the My World FAQ' })).toBeVisible()
    expect(within(overlay).getByLabelText('Display name')).toHaveFocus()
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Draft survives re-auth')
    expect(onSessionStateChanged).toHaveBeenCalledWith({ status: 'locked' })

    checkSessionMock.mockResolvedValueOnce({
      status: 'ready',
      identity: {
        displayName: 'Mina',
        idleExpiresAt: READY_DATA.identity.idleExpiresAt,
        absoluteExpiresAt: READY_DATA.identity.absoluteExpiresAt,
      },
    })
    await user.type(within(overlay).getByLabelText('Display name'), 'Mina')
    await user.type(within(overlay).getByLabelText('Shared password'), 'team password')
    await user.click(within(overlay).getByRole('button', { name: 'Unlock editor' }))

    await waitFor(() =>
      expect(screen.queryByTestId('faq-editor-access-overlay')).not.toBeInTheDocument(),
    )
    expect(screen.getByTestId('faq-editor-protected-root')).not.toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Draft survives re-auth')
    expect(screen.getByText('Mina')).toBeInTheDocument()
    expect(
      screen.queryByRole('alertdialog', { name: 'Discard your draft and reload?' }),
    ).not.toBeInTheDocument()
  }, 15_000)

  it('retries an unavailable BFCache probe without discarding the in-memory draft', async () => {
    const user = userEvent.setup()
    const onSessionStateChanged = vi.fn()
    checkSessionMock.mockResolvedValueOnce({ status: 'unavailable' }).mockResolvedValueOnce({
      status: 'ready',
      identity: {
        displayName: 'Mina',
        idleExpiresAt: READY_DATA.identity.idleExpiresAt,
        absoluteExpiresAt: READY_DATA.identity.absoluteExpiresAt,
      },
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={onSessionStateChanged} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft survives an unavailable probe' },
    })
    fireEvent(window, new Event('pagehide'))
    const pageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(pageShow, 'persisted', { value: true })
    fireEvent(window, pageShow)

    const overlay = await screen.findByRole('dialog', { name: 'Editor unavailable' })
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Draft survives an unavailable probe')
    expect(onSessionStateChanged).toHaveBeenCalledWith({ status: 'unavailable' })

    await user.click(within(overlay).getByRole('button', { name: 'Try again' }))

    await waitFor(() =>
      expect(screen.queryByTestId('faq-editor-access-overlay')).not.toBeInTheDocument(),
    )
    expect(checkSessionMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('faq-editor-protected-root')).not.toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Draft survives an unavailable probe')
    expect(screen.getByText('Mina')).toBeInTheDocument()
  })

  it('only applies the latest overlapping access probe', async () => {
    const firstProbe = deferred<MyWorldFaqEditorSessionState>()
    const secondProbe = deferred<MyWorldFaqEditorSessionState>()
    checkSessionMock
      .mockReturnValueOnce(firstProbe.promise)
      .mockReturnValueOnce(secondProbe.promise)
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)
    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft survives overlapping probes' },
    })

    const firstPageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(firstPageShow, 'persisted', { value: true })
    fireEvent(window, firstPageShow)
    const secondPageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(secondPageShow, 'persisted', { value: true })
    fireEvent(window, secondPageShow)
    expect(checkSessionMock).toHaveBeenCalledTimes(2)

    secondProbe.resolve({
      status: 'ready',
      identity: {
        displayName: 'Mina',
        idleExpiresAt: READY_DATA.identity.idleExpiresAt,
        absoluteExpiresAt: READY_DATA.identity.absoluteExpiresAt,
      },
    })
    await waitFor(() =>
      expect(screen.queryByTestId('faq-editor-access-overlay')).not.toBeInTheDocument(),
    )

    firstProbe.resolve({ status: 'unavailable' })
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByTestId('faq-editor-access-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('faq-editor-protected-root')).not.toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Draft survives overlapping probes')
    expect(screen.getByText('Mina')).toBeInTheDocument()
  })

  it('rejects an already absolutely expired ready probe', async () => {
    const onSessionStateChanged = vi.fn()
    checkSessionMock.mockResolvedValueOnce({
      status: 'ready',
      identity: {
        displayName: 'Mina',
        idleExpiresAt: '2000-01-01T00:00:00.000Z',
        absoluteExpiresAt: '2000-01-01T00:00:00.000Z',
      },
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={onSessionStateChanged} />)
    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft survives an expired ready response' },
    })

    const pageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(pageShow, 'persisted', { value: true })
    fireEvent(window, pageShow)

    const overlay = await screen.findByRole('dialog', { name: 'Edit the My World FAQ' })
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue(
      'Draft survives an expired ready response',
    )
    expect(within(overlay).getByLabelText('Display name')).toHaveFocus()
    expect(onSessionStateChanged).toHaveBeenCalledWith({ status: 'locked' })
  })

  it('times out an access probe and retries without discarding the in-memory draft', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'))
    checkSessionMock
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({
        status: 'ready',
        identity: {
          displayName: 'Mina',
          idleExpiresAt: '2026-07-29T11:00:00.000Z',
          absoluteExpiresAt: '2026-07-29T18:00:00.000Z',
        },
      })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)
    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft survives a probe timeout' },
    })

    const pageShow = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(pageShow, 'persisted', { value: true })
    fireEvent(window, pageShow)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001)
    })

    const overlay = screen.getByRole('dialog', { name: 'Editor unavailable' })
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Draft survives a probe timeout')

    fireEvent.click(within(overlay).getByRole('button', { name: 'Try again' }))
    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.queryByTestId('faq-editor-access-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('faq-editor-protected-root')).not.toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Draft survives a probe timeout')
    expect(screen.getByText('Mina')).toBeInTheDocument()
  })

  it('re-probes at the idle deadline, renews a ready session, and keeps a locked result gated', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'))
    const onSessionStateChanged = vi.fn()
    checkSessionMock
      .mockResolvedValueOnce({
        status: 'ready',
        identity: {
          displayName: 'Mina',
          idleExpiresAt: '2026-07-29T10:00:05.000Z',
          absoluteExpiresAt: '2026-07-29T18:00:00.000Z',
        },
      })
      .mockResolvedValueOnce({ status: 'locked' })
    const data = {
      ...READY_DATA,
      identity: {
        ...READY_DATA.identity,
        idleExpiresAt: '2026-07-29T10:00:01.000Z',
        absoluteExpiresAt: '2026-07-29T18:00:00.000Z',
      },
    }
    render(<MyWorldFaqEditorPage data={data} onSessionStateChanged={onSessionStateChanged} />)

    expect(screen.getByTestId('faq-editor-protected-root')).not.toHaveAttribute('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001)
    })

    expect(checkSessionMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('faq-editor-access-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('faq-editor-protected-root')).not.toHaveAttribute('hidden')
    expect(screen.getByText('Mina')).toBeInTheDocument()
    expect(onSessionStateChanged).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_998)
    })
    expect(checkSessionMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2)
    })

    const overlay = screen.getByRole('dialog', { name: 'Edit the My World FAQ' })
    expect(checkSessionMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveAttribute('hidden')
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveProperty('inert', true)
    expect(within(overlay).getByLabelText('Display name')).toHaveFocus()
    expect(onSessionStateChanged).toHaveBeenCalledWith({ status: 'locked' })
  })

  it('uses current manifest limits and UTF-8 byte counts for field guidance', async () => {
    const user = userEvent.setup()
    const documentWithUnicodeUrl = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    const source = documentWithUnicodeUrl.sources[0]
    if (!source) throw new Error('FAQ fixture has no source.')
    source.url = 'https://example.com/🙂'
    const data = {
      ...READY_DATA,
      base: { ...READY_DATA.base, document: documentWithUnicodeUrl },
      manifest: {
        ...READY_DATA.manifest,
        limits: {
          ...READY_DATA.manifest.limits,
          'route-title': { warningGraphemes: 5, maxGraphemes: 9 },
          question: { warningGraphemes: 8, maxGraphemes: 12 },
          body: { maxGraphemes: 34 },
          url: { maxBytes: 99 },
        },
      },
    } as unknown as typeof READY_DATA
    render(<MyWorldFaqEditorPage data={data} onSessionStateChanged={() => undefined} />)

    expect(screen.getByText(/Aim for 5 graphemes or fewer; maximum 9/)).toBeInTheDocument()
    expect(screen.getByText(/\/ 9 graphemes/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supporting records' }))
    const records = screen.getByRole('dialog', { name: 'Supporting records' })
    const expectedBytes = new TextEncoder().encode(source.url).byteLength
    expect(within(records).getByText(`${expectedBytes} / 99 UTF-8 bytes`)).toBeInTheDocument()
    expect(
      within(records).getAllByText('Use an absolute HTTPS URL up to 99 UTF-8 bytes.'),
    ).not.toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Close supporting records' }))
    await user.click(screen.getByRole('button', { name: 'Add question' }))
    const addDialog = screen.getByRole('dialog', { name: 'Add a question' })
    expect(within(addDialog).getByLabelText('Question')).toHaveAttribute('maxlength', '12')
    expect(within(addDialog).getByLabelText('Detailed answer')).toHaveAttribute('maxlength', '34')
  })

  it('disables question creation with an accessible reason at the lifetime cap', () => {
    let cappedDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    for (let index = 1; index <= 50; index += 1) {
      const hex = index.toString(16)
      cappedDocument = addTeamFaqQuestion(cappedDocument, {
        id: `team-${hex.padStart(8, '0')}-0000-4000-8000-${hex.padStart(12, '0')}`,
        clusterId: 'evidence-next-decision',
        displayedQuestion: `How should the team review capped question ${index}?`,
        shortAnswer:
          'The team should document what is known, what remains uncertain, who must review it, and which decision this working answer can support.',
        detailedAnswer:
          'This working answer remains open to human review, evidence and correction.',
        limitations: 'The review owner and evidence threshold still need confirmation.',
        reviewDate: '2026-07-30',
      })
    }
    const cappedData = {
      ...READY_DATA,
      base: {
        ...READY_DATA.base,
        document: cappedDocument,
      },
    } satisfies typeof READY_DATA

    render(<MyWorldFaqEditorPage data={cappedData} onSessionStateChanged={() => undefined} />)

    const addButton = screen.getByRole('button', { name: 'Add question' })
    const reason = screen.getByText('This FAQ already has the maximum of 50 team-added questions.')
    expect(addButton).toBeDisabled()
    expect(addButton).toHaveAttribute('aria-describedby', reason.id)
  })

  it('publishes the exact authority-free payload and adopts a degraded authoritative success', async () => {
    const user = userEvent.setup()
    const committedDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    committedDocument.route.title = 'Authoritative published title'
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(publishSuccess(snapshot(5, committedDocument), { resilience: 'degraded' }))
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Browser draft title' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Published' })).toBeDisabled())
    const [, init] = fetchMock.mock.calls[0] ?? []
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(Object.keys(requestBody).sort()).toEqual([
      'attemptId',
      'document',
      'expectedBase',
      'schemaVersion',
    ])
    expect(requestBody).toMatchObject({
      schemaVersion: 1,
      document: expect.objectContaining({
        route: expect.objectContaining({ title: 'Browser draft title' }),
      }),
      expectedBase: READY_DATA.base.head,
      attemptId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    })
    expect(requestBody).not.toHaveProperty('savedByName')
    expect(screen.getByLabelText('Page title')).toHaveValue('Authoritative published title')
    expect(screen.getByText('0 changes')).toBeInTheDocument()
    expect(screen.getByText('Version 5')).toBeInTheDocument()
    expect(
      screen.getByText(/Published successfully, but the public cache could not be refreshed/),
    ).toBeInTheDocument()
  }, 15_000)

  it('keeps an oversized valid UTF-8 envelope local instead of calling fetch', async () => {
    const oversizedRequest = buildValidPublishRequestAtByteLength(
      MY_WORLD_FAQ_PUBLISH_BODY_MAX_BYTES + 1,
    )
    const baseDocument = structuredClone(oversizedRequest.document)
    baseDocument.route.title = 'Boundary draft A'
    const data = {
      ...READY_DATA,
      base: {
        ...READY_DATA.base,
        document: baseDocument,
      },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    render(<MyWorldFaqEditorPage data={data} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: oversizedRequest.document.route.title },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save & publish' }))

    expect(
      await screen.findByText(
        'The FAQ draft is too large to publish. Shorten some fields, then try again.',
      ),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save & publish' })).not.toBeDisabled()
    expect(screen.getByLabelText('Page title')).toHaveValue('Boundary draft B')
  }, 30_000)

  it('locks editing and leave actions until an in-flight publish settles', async () => {
    const user = userEvent.setup()
    const pendingResponse = deferred<Response>()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(pendingResponse.promise)
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Locked while publishing' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled())
    expect(screen.getByLabelText('Page title')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Supporting records' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Versions & undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Exit' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'A late edit that must be refused' },
    })
    expect(screen.getByLabelText('Page title')).toHaveValue('Locked while publishing')

    const [, init] = fetchMock.mock.calls[0] ?? []
    const requestBody = JSON.parse(String(init?.body)) as PublishMyWorldFaqEditorRequest
    pendingResponse.resolve(publishSuccess(snapshot(5, requestBody.document)))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Published' })).toBeDisabled())
    expect(screen.getByLabelText('Page title')).toHaveValue('Locked while publishing')
    expect(screen.getByRole('button', { name: 'Versions & undo' })).toBeEnabled()
  })

  it('edits and publishes a source author without changing its locked structure', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as PublishMyWorldFaqEditorRequest
      return publishSuccess(snapshot(5, request.document))
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Supporting records' }))
    const records = screen.getByRole('dialog', { name: 'Supporting records' })
    const firstAuthor = within(records).getAllByLabelText('Author 1')[0]
    if (!firstAuthor) throw new Error('The source author field was not rendered.')
    fireEvent.change(firstAuthor, { target: { value: 'Updated source author' } })
    await user.click(within(records).getByRole('button', { name: 'Close supporting records' }))
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Published' })).toBeDisabled())
    const [, init] = fetchMock.mock.calls[0] ?? []
    const request = JSON.parse(String(init?.body)) as PublishMyWorldFaqEditorRequest
    expect(request.document.sources[0]?.authors[0]).toBe('Updated source author')
    expect(request.document.sources).toHaveLength(READY_DATA.base.document.sources.length)
  })

  it('reuses an attempt after a lost response and resets it after success and edits', async () => {
    const user = userEvent.setup()
    let requestCount = 0
    const requestBodies: Array<{
      attemptId: string
      document: typeof DEFAULT_MY_WORLD_FAQ_CONTENT
    }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        attemptId: string
        document: typeof DEFAULT_MY_WORLD_FAQ_CONTENT
      }
      requestBodies.push(body)
      requestCount += 1
      if (requestCount === 1) throw new TypeError('response was lost')
      return publishSuccess(snapshot(requestCount + 3, body.document))
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Retry this exact draft' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))
    expect(await screen.findByText(/Publishing could not be confirmed/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))
    await waitFor(() => expect(screen.getByText('Version 5')).toBeInTheDocument())

    expect(requestBodies[0]?.attemptId).toBe(requestBodies[1]?.attemptId)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'A new draft after success' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))
    await waitFor(() => expect(screen.getByText('Version 6')).toBeInTheDocument())
    expect(requestBodies[2]?.attemptId).not.toBe(requestBodies[1]?.attemptId)
  }, 15_000)

  it('classifies a stale conflict and only replaces the draft after confirmed Start from live', async () => {
    const user = userEvent.setup()
    const latestDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    latestDocument.route.description = 'A remote description'
    latestDocument.page.hero.eyebrow = 'Remote eyebrow'
    latestDocument.page.hero.heading = 'Shared converged heading'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: 'stale_head',
          message: 'Someone published a newer version.',
          latest: snapshot(5, latestDocument),
        },
        { status: 409 },
      ),
    )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Local title wording' },
    })
    fireEvent.change(screen.getByLabelText('Page description'), {
      target: { value: 'My overlapping description' },
    })
    fireEvent.change(screen.getByLabelText('Hero heading'), {
      target: { value: 'Shared converged heading' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Version 5 changed while you were editing',
    })
    expect(
      within(dialog)
        .getAllByText('Only in my draft')
        .find((element) => element.tagName === 'DT')?.parentElement,
    ).toHaveTextContent('Only in my draft1')
    expect(
      within(dialog)
        .getAllByText('Only in live')
        .find((element) => element.tagName === 'DT')?.parentElement,
    ).toHaveTextContent('Only in live1')
    expect(
      within(dialog)
        .getAllByText('Same change')
        .find((element) => element.tagName === 'DT')?.parentElement,
    ).toHaveTextContent('Same change1')
    expect(
      within(dialog)
        .getAllByText('Both changed differently')
        .find((element) => element.tagName === 'DT')?.parentElement,
    ).toHaveTextContent('Both changed differently1')
    expect(within(dialog).getAllByRole('button', { name: /^Copy my draft for / })).not.toHaveLength(
      0,
    )
    expect(screen.getByText('Save & publish').closest('button')).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'Start from live' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Discard your draft and start from live?',
    })
    await user.click(
      within(confirmation).getByRole('button', {
        name: 'Discard draft and start from live',
      }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Page title')).toHaveValue(
      DEFAULT_MY_WORLD_FAQ_CONTENT.route.title,
    )
    expect(screen.getByLabelText('Hero label')).toHaveValue('Remote eyebrow')
    expect(screen.getByText('Version 5')).toBeInTheDocument()
    expect(screen.getByText('0 changes')).toBeInTheDocument()
  }, 15_000)

  it('keeps committed, local and live snapshots when a successful publish is superseded', async () => {
    const user = userEvent.setup()
    const localDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    localDocument.route.title = 'My committed wording'
    const liveDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    liveDocument.route.title = 'Newer live wording'
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      publishSuccess(snapshot(5, localDocument), {
        outcome: 'committed-but-superseded',
        live: snapshot(6, liveDocument),
      }),
    )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'My committed wording' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Version 5 published, but version 6 is now live',
    })
    expect(within(dialog).getByText('My committed wording')).toBeInTheDocument()
    expect(within(dialog).getByText('Newer live wording')).toBeInTheDocument()
    expect(screen.getByLabelText('Page title')).toHaveValue('My committed wording')
    expect(screen.getByText('Published').closest('button')).toBeDisabled()
    expect(screen.getByText(/Published version 5, but version 6 is now live/)).toBeInTheDocument()
  }, 15_000)

  it('hides protected content on a publish 401 while preserving the mounted draft', async () => {
    const user = userEvent.setup()
    const onSessionStateChanged = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: 'session_expired',
          message: 'Your editor session has expired.',
        },
        { status: 401 },
      ),
    )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={onSessionStateChanged} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Preserved through 401' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    await screen.findByTestId('faq-editor-access-overlay')
    expect(screen.getByRole('dialog', { name: 'Edit the My World FAQ' })).toBeInTheDocument()
    expect(screen.getByLabelText('Display name')).toHaveFocus()
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue('Preserved through 401')
    expect(onSessionStateChanged).toHaveBeenCalledWith({ status: 'locked' })
  }, 15_000)

  it('shows and focuses returned 422 field issues without replacing the draft', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: 'validation_failed',
          message: 'Some fields need attention.',
          issues: [
            {
              path: 'route.title',
              code: 'prohibited_claim',
              message: 'Review this title before publishing.',
            },
          ],
          warnings: [],
        },
        { status: 422 },
      ),
    )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'A locally valid title' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    expect(await screen.findAllByText('Review this title before publishing.')).not.toHaveLength(0)
    expect(screen.getByLabelText('Page title')).toHaveValue('A locally valid title')
    expect(screen.getByLabelText('Page title')).toHaveFocus()
    expect(screen.getByLabelText('Page title')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Version 4')).toBeInTheDocument()
    expect(screen.getByText('1 change')).toBeInTheDocument()
  }, 15_000)

  it('preserves base and working copy on a publish 503', async () => {
    const user = userEvent.setup()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: 'persistence_unavailable',
          message: 'The FAQ could not be published right now. Your draft is unchanged.',
        },
        { status: 503 },
      ),
    )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Preserved through 503' },
    })
    await user.click(screen.getByRole('button', { name: 'Save & publish' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Your draft is unchanged')
    expect(screen.getByLabelText('Page title')).toHaveValue('Preserved through 503')
    expect(screen.getByText('Version 4')).toBeInTheDocument()
    expect(screen.getByText('1 change')).toBeInTheDocument()
  }, 15_000)

  it('paginates protected metadata and previews one revision without changing the draft', async () => {
    const user = userEvent.setup()
    const historicalDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    historicalDocument.page.hero.introduction = 'Historical introduction for preview only.'
    loadHistoryMock
      .mockResolvedValueOnce({
        status: 'ready',
        items: [revisionMetadata(3)],
        nextBeforeVersion: 3,
      })
      .mockResolvedValueOnce({
        status: 'ready',
        items: [revisionMetadata(2)],
        nextBeforeVersion: null,
      })
    loadPreviewMock.mockResolvedValue({
      status: 'ready',
      revision: revisionPreview(3, historicalDocument),
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft stays in the editor' },
    })
    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    expect(within(dialog).getByRole('button', { name: /Version 3/ })).toHaveTextContent(
      'Saved by Jo (self-declared)',
    )

    await user.click(within(dialog).getByRole('button', { name: 'Load earlier versions' }))
    expect(await within(dialog).findByRole('button', { name: /Version 2/ })).toBeInTheDocument()
    expect(loadHistoryMock).toHaveBeenNthCalledWith(2, {
      data: { beforeVersion: 3, limit: 20 },
    })

    await user.click(within(dialog).getByRole('button', { name: /Version 3/ }))
    const preview = await within(dialog).findByTestId('faq-historical-preview')
    expect(
      within(preview).getByText('Historical introduction for preview only.'),
    ).toBeInTheDocument()

    for (const modifier of ['metaKey', 'ctrlKey'] as const) {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      })
      window.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(assignLocationMock).not.toHaveBeenCalled()

    expect(screen.getByLabelText('Page title')).toHaveValue('Draft stays in the editor')
    expect(screen.getByText('1 change')).toBeInTheDocument()
  }, 15_000)

  it('waits for an explicit retry when revision history is unavailable', async () => {
    const user = userEvent.setup()
    loadHistoryMock.mockResolvedValue({ status: 'unavailable' })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    expect(
      await within(dialog).findByText('Revision history is unavailable right now.'),
    ).toBeInTheDocument()
    expect(loadHistoryMock).toHaveBeenCalledTimes(1)

    await user.click(within(dialog).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(loadHistoryMock).toHaveBeenCalledTimes(2))
  })

  it('blocks dirty restore, keeps the draft, and only discards after reloading current live', async () => {
    const user = userEvent.setup()
    const currentDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    currentDocument.route.title = 'Reloaded current title'
    loadEditorMock.mockResolvedValue({
      ...READY_DATA,
      base: snapshot(5, currentDocument),
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Unpublished draft title' },
    })
    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    let dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(dialog).getByRole('button', { name: /Version 3/ }))
    expect(
      await within(dialog).findByRole('button', { name: 'Restore this version' }),
    ).toBeDisabled()

    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Versions & undo' })).not.toBeInTheDocument(),
    )
    expect(screen.getByLabelText('Page title')).toHaveValue('Unpublished draft title')

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(dialog).getByRole('button', { name: 'Discard draft and reload' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Discard your draft and reload?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Discard and reload' }))

    await waitFor(() => expect(screen.getByText('Version 5')).toBeInTheDocument())
    expect(screen.getByLabelText('Page title')).toHaveValue('Reloaded current title')
    expect(screen.getByText('0 changes')).toBeInTheDocument()
    expect(
      within(screen.getByRole('dialog', { name: 'Versions & undo' })).getByRole('button', {
        name: 'Restore this version',
      }),
    ).toBeEnabled()
  }, 15_000)

  it('keeps a dirty draft and reports a failed discard reload inside its confirmation', async () => {
    const user = userEvent.setup()
    loadEditorMock.mockRejectedValue(new TypeError('database unavailable'))
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft that must survive a failed reload' },
    })
    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const history = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(history).getByRole('button', { name: /Version 3/ }))
    await user.click(within(history).getByRole('button', { name: 'Discard draft and reload' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Discard your draft and reload?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Discard and reload' }))

    expect(
      await within(confirmation).findByText(
        'The current live version could not be reloaded. Your draft is unchanged.',
      ),
    ).toBeVisible()
    expect(screen.getByLabelText('Page title')).toHaveValue(
      'Draft that must survive a failed reload',
    )
    expect(screen.getByText('Version 4')).toBeInTheDocument()
  })

  it('releases a timed-out discard reload without discarding the draft', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'))
    loadEditorMock.mockImplementationOnce(() => new Promise(() => undefined))
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    fireEvent.change(screen.getByLabelText('Page title'), {
      target: { value: 'Draft that must survive a reload timeout' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Versions & undo' }))
    await act(async () => {
      await Promise.resolve()
    })
    const history = screen.getByRole('dialog', { name: 'Versions & undo' })
    fireEvent.click(within(history).getByRole('button', { name: /Version 3/ }))
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(within(history).getByRole('button', { name: 'Discard draft and reload' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Discard your draft and reload?',
    })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Discard and reload' }))
    expect(within(confirmation).getByRole('button', { name: 'Reloading…' })).toBeDisabled()
    expect(screen.getByLabelText('Page title')).toBeDisabled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_001)
    })

    expect(
      within(confirmation).getByText(
        'The current live version could not be reloaded. Your draft is unchanged.',
      ),
    ).toBeVisible()
    expect(within(confirmation).getByRole('button', { name: 'Discard and reload' })).toBeEnabled()
    expect(screen.getByLabelText('Page title')).toBeEnabled()
    expect(screen.getByLabelText('Page title')).toHaveValue(
      'Draft that must survive a reload timeout',
    )
    expect(screen.getByText('Version 4')).toBeInTheDocument()
  })

  it('confirms an exact restore request and adopts the authoritative degraded success', async () => {
    const user = userEvent.setup()
    const restoredDocument = structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT)
    restoredDocument.route.title = 'Authoritative restored title'
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(restoreSuccess(snapshot(5, restoredDocument), { resilience: 'degraded' }))
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(dialog).getByRole('button', { name: /Version 3/ }))
    await user.click(await within(dialog).findByRole('button', { name: 'Restore this version' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Restore version 3 as a new version?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Restore and publish' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Versions & undo' })).not.toBeInTheDocument(),
    )
    const [, init] = fetchMock.mock.calls[0] ?? []
    const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(Object.keys(requestBody).sort()).toEqual([
      'attemptId',
      'expectedBase',
      'schemaVersion',
      'targetRevisionId',
    ])
    expect(requestBody).toMatchObject({
      schemaVersion: 1,
      targetRevisionId: snapshot(3).head.revisionId,
      expectedBase: READY_DATA.base.head,
      attemptId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    })
    expect(requestBody).not.toHaveProperty('savedByName')
    expect(screen.getByLabelText('Page title')).toHaveValue('Authoritative restored title')
    expect(screen.getByText('Version 5')).toBeInTheDocument()
    expect(screen.getByText('0 changes')).toBeInTheDocument()
    expect(
      screen.getByText(/Restored successfully, but the public cache could not be refreshed/),
    ).toBeInTheDocument()
  }, 15_000)

  it('keeps restore confirmation and editor actions locked until restore settles', async () => {
    const user = userEvent.setup()
    const pendingResponse = deferred<Response>()
    vi.spyOn(globalThis, 'fetch').mockReturnValue(pendingResponse.promise)
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const history = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(history).getByRole('button', { name: /Version 3/ }))
    await user.click(await within(history).findByRole('button', { name: 'Restore this version' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Restore version 3 as a new version?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Restore and publish' }))

    await waitFor(() =>
      expect(within(confirmation).getByRole('button', { name: 'Restoring…' })).toBeDisabled(),
    )
    expect(
      within(confirmation).getByRole('button', { name: 'Keep current version' }),
    ).toBeDisabled()
    expect(screen.getByLabelText('Page title')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Versions & undo', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Log out', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Exit', hidden: true })).toBeDisabled()

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(
      screen.getByRole('alertdialog', { name: 'Restore version 3 as a new version?' }),
    ).toBeInTheDocument()

    pendingResponse.resolve(restoreSuccess(snapshot(5)))
    await waitFor(() => expect(screen.getByText('Version 5')).toBeInTheDocument())
    expect(
      screen.queryByRole('alertdialog', { name: 'Restore version 3 as a new version?' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Page title')).toBeEnabled()
  })

  it('reuses the restore attempt after response loss', async () => {
    const user = userEvent.setup()
    const requestBodies: Array<{ attemptId: string }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as { attemptId: string })
      if (requestBodies.length === 1) throw new TypeError('response was lost')
      return restoreSuccess(snapshot(5))
    })
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(dialog).getByRole('button', { name: /Version 3/ }))
    await user.click(await within(dialog).findByRole('button', { name: 'Restore this version' }))
    let confirmation = screen.getByRole('alertdialog', {
      name: 'Restore version 3 as a new version?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Restore and publish' }))
    expect(await screen.findByText('The restore could not be confirmed. Try again.')).toBeVisible()

    confirmation = screen.getByRole('alertdialog', {
      name: 'Restore version 3 as a new version?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Restore and publish' }))
    await waitFor(() => expect(screen.getByText('Version 5')).toBeInTheDocument())
    expect(requestBodies).toHaveLength(2)
    expect(requestBodies[0]?.attemptId).toBe(requestBodies[1]?.attemptId)
  }, 15_000)

  it('blocks a stale restore until the current head is reloaded', async () => {
    const user = userEvent.setup()
    loadEditorMock.mockResolvedValue({
      ...READY_DATA,
      base: snapshot(5),
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: 'stale_head',
          message: 'Someone published a newer version.',
          latest: snapshot(5),
        },
        { status: 409 },
      ),
    )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    let dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(dialog).getByRole('button', { name: /Version 3/ }))
    await user.click(await within(dialog).findByRole('button', { name: 'Restore this version' }))
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: 'Restore version 3 as a new version?' }),
      ).getByRole('button', { name: 'Restore and publish' }),
    )

    expect(
      await screen.findByText(/Someone published a newer version.*Reload the current version/),
    ).toBeInTheDocument()
    dialog = screen.getByRole('dialog', { name: 'Versions & undo' })
    expect(within(dialog).getByRole('button', { name: 'Restore this version' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: 'Reload current version' }))

    await waitFor(() => expect(screen.getByText('Version 5')).toBeInTheDocument())
    expect(
      within(screen.getByRole('dialog', { name: 'Versions & undo' })).getByRole('button', {
        name: 'Restore this version',
      }),
    ).toBeEnabled()
  }, 15_000)

  it('preserves the selected preview through 422 and 503 restore failures', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, error: 'revision_unavailable', message: 'Revision unavailable.' },
          { status: 422 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            ok: false,
            error: 'persistence_unavailable',
            message: 'Restore unavailable right now.',
          },
          { status: 503 },
        ),
      )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(dialog).getByRole('button', { name: /Version 3/ }))
    await user.click(await within(dialog).findByRole('button', { name: 'Restore this version' }))
    let confirmation = screen.getByRole('alertdialog', {
      name: 'Restore version 3 as a new version?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Restore and publish' }))
    expect(await screen.findByText('Revision unavailable.')).toBeInTheDocument()
    expect(screen.getByText('Version 4')).toBeInTheDocument()
    expect(screen.getByTestId('faq-historical-preview')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Restore this version' }))
    confirmation = screen.getByRole('alertdialog', {
      name: 'Restore version 3 as a new version?',
    })
    await user.click(within(confirmation).getByRole('button', { name: 'Restore and publish' }))
    expect(await screen.findByText('Restore unavailable right now.')).toBeInTheDocument()
    expect(screen.getByText('Version 4')).toBeInTheDocument()
    expect(screen.getByTestId('faq-historical-preview')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }, 15_000)

  it('hides protected history on an expired restore while preserving editor state', async () => {
    const user = userEvent.setup()
    const onSessionStateChanged = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: 'session_expired',
          message: 'Your editor session has expired.',
        },
        { status: 401 },
      ),
    )
    render(<MyWorldFaqEditorPage data={READY_DATA} onSessionStateChanged={onSessionStateChanged} />)

    await user.click(screen.getByRole('button', { name: 'Versions & undo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Versions & undo' })
    await user.click(within(dialog).getByRole('button', { name: /Version 3/ }))
    await user.click(await within(dialog).findByRole('button', { name: 'Restore this version' }))
    await user.click(
      within(
        screen.getByRole('alertdialog', { name: 'Restore version 3 as a new version?' }),
      ).getByRole('button', { name: 'Restore and publish' }),
    )

    await screen.findByTestId('faq-editor-access-overlay')
    expect(screen.getByTestId('faq-editor-protected-root')).toHaveAttribute('hidden')
    expect(screen.getByLabelText('Page title')).toHaveValue(READY_DATA.base.document.route.title)
    expect(onSessionStateChanged).toHaveBeenCalledWith({ status: 'locked' })
  }, 15_000)

  it('uses the discard dialog for a blocked same-document navigation', async () => {
    const user = userEvent.setup()
    const navigationBlock = { proceed: vi.fn(), reset: vi.fn() }
    const { rerender } = render(
      <MyWorldFaqEditorPage
        data={READY_DATA}
        onSessionStateChanged={() => undefined}
        navigationBlock={navigationBlock}
      />,
    )

    expect(screen.getByRole('alertdialog', { name: 'Discard your changes?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(navigationBlock.reset).toHaveBeenCalledTimes(1)

    rerender(
      <MyWorldFaqEditorPage
        data={READY_DATA}
        onSessionStateChanged={() => undefined}
        navigationBlock={navigationBlock}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Discard and leave' }))
    expect(navigationBlock.proceed).toHaveBeenCalledTimes(1)
  })

  it('hides and inerts protected DOM while access is checked', () => {
    const root = document.createElement('div')

    setEditorProtectedRootVisibility(root, false)
    expect(root.hidden).toBe(true)
    expect(root.inert).toBe(true)

    setEditorProtectedRootVisibility(root, true)
    expect(root.hidden).toBe(false)
    expect(root.inert).toBe(false)
  })
})
