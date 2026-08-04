import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import {
  addTeamFaqQuestion,
  DEFAULT_MY_WORLD_FAQ_CONTENT,
  FAQ_CONCERN_CLUSTERS,
  FAQ_QUESTIONS,
} from '~/data/my-world-faq'

describe('MyWorldFaqPage comprehension checkpoint', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('separates Product at a glance and FAQ in the top navigation', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    expect(screen.getByRole('link', { name: 'Product at a glance' })).toHaveAttribute(
      'href',
      '#product',
    )
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq')
    expect(screen.queryByRole('link', { name: /edit faq/i })).not.toBeInTheDocument()
  })

  it('registers its authoring shortcut only on the public page', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const publicPage = render(
      <MyWorldFaqPage
        feedbackEnabled={false}
        content={DEFAULT_MY_WORLD_FAQ_CONTENT}
        authoringShortcutEnabled
      />,
    )
    const publicKeydownHandler = addEventListener.mock.calls.find(
      ([type]) => type === 'keydown',
    )?.[1]

    expect(publicKeydownHandler).toBeTypeOf('function')
    expect(addEventListener).toHaveBeenCalledWith('keydown', publicKeydownHandler, true)

    publicPage.unmount()
    expect(removeEventListener).toHaveBeenCalledWith('keydown', publicKeydownHandler, true)

    addEventListener.mockClear()
    render(
      <MyWorldFaqPage
        feedbackEnabled={false}
        content={DEFAULT_MY_WORLD_FAQ_CONTENT}
        authoringShortcutEnabled={false}
        editorMode
      />,
    )
    expect(addEventListener.mock.calls.some(([type]) => type === 'keydown')).toBe(false)

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(window, event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('shows one active desktop product clip at a time with a poster and text equivalent', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    const loop = screen.getByTestId('faq-product-loop')
    for (const step of ['Capture', 'My Identity', 'History', 'Path Finder']) {
      expect(within(loop).getByRole('tab', { name: step })).toBeInTheDocument()
    }

    expect(within(loop).getAllByTestId('faq-product-video')).toHaveLength(1)
    expect(within(loop).getByTestId('faq-product-video')).toHaveAttribute(
      'src',
      '/my-world-faq/product/capture-desktop.webm',
    )
    expect(within(loop).getByTestId('faq-product-video')).toHaveAttribute(
      'poster',
      '/my-world-faq/product/capture-desktop-poster.png',
    )
    expect(within(loop).getByTestId('faq-product-video')).not.toHaveAttribute('autoplay')
    expect(within(loop).getByText(/send is never pressed/i)).toBeInTheDocument()

    await user.click(within(loop).getByRole('tab', { name: 'My Identity' }))
    expect(within(loop).getAllByTestId('faq-product-video')).toHaveLength(1)
    expect(within(loop).getByTestId('faq-product-video')).toHaveAttribute(
      'src',
      '/my-world-faq/product/identity-desktop.webm',
    )
    expect(within(loop).getByText(/filters the synthetic timeline/i)).toBeInTheDocument()
  })

  it('tells one continuous story from the opener through status and feedback', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    const sections = [
      screen.getByTestId('faq-opener'),
      screen.getByTestId('faq-product-loop'),
      screen.getByTestId('faq-build-iceberg'),
      screen.getByTestId('faq-why'),
      screen.getByTestId('faq-signals'),
      screen.getByTestId('faq-question-field'),
      screen.getByTestId('faq-posture'),
      screen.getByTestId('faq-contribution'),
    ]

    for (let index = 0; index < sections.length - 1; index += 1) {
      const current = sections[index]
      const next = sections[index + 1]
      if (!current || !next) throw new Error('FAQ story section was not found')
      expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('shows the playful surface and bounded backstage layers without interaction', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    const build = screen.getByTestId('faq-build-iceberg')
    expect(
      within(build).getByRole('heading', {
        name: 'Playful on the surface. Deliberate underneath.',
      }),
    ).toBeInTheDocument()
    for (const label of [
      'Companion',
      'Capture',
      'Living island',
      'Collector',
      'Connector',
      'Verifier',
      'Cartographer',
    ]) {
      expect(within(build).getByText(label)).toBeInTheDocument()
    }
    expect(within(build).queryByText(/after a capture/i)).not.toBeInTheDocument()
    expect(within(build).queryByText(/later, after review/i)).not.toBeInTheDocument()
    expect(within(build).queryByText(/for Connector links/i)).not.toBeInTheDocument()
    expect(within(build).queryByText(/when sensemaking is requested/i)).not.toBeInTheDocument()
    expect(within(build).getByText(/supported by the student’s own words/i)).toBeInTheDocument()
    expect(within(build).getAllByText('AI support')).toHaveLength(3)
    expect(within(build).getByText('Evidence check')).toBeInTheDocument()
    expect(within(build).getByText(/at 10pm local time/i)).toBeInTheDocument()
    expect(within(build).getByText(/Animal Crossing: New Horizons/i)).toBeInTheDocument()
    expect(within(build).queryByText(/precedent is not proof/i)).not.toBeInTheDocument()
    expect(within(build).queryByRole('link', { name: /Nintendo/i })).not.toBeInTheDocument()
    expect(within(build).queryByText(/Kira/)).not.toBeInTheDocument()

    const backstage = within(build).getByTestId('faq-build-backstage')
    const connectorLayer = within(build).getByText('Connector').closest('li')
    const verifierPanel = within(build).getByTestId('faq-verifier-panel')
    const deliberateDecision = within(build).getByTestId('faq-deliberate-decision')
    expect(within(build).queryByText('The waterline')).not.toBeInTheDocument()
    expect(within(build).queryByText('Mirror')).not.toBeInTheDocument()
    expect(build.querySelectorAll('svg circle')).toHaveLength(0)
    expect(connectorLayer).toContainElement(verifierPanel)
    expect(backstage).toContainElement(deliberateDecision)
    expect(within(backstage).getByText('AI specialists and product team')).toBeInTheDocument()
    expect(within(backstage).getByText(/conversation design, safety rules/i)).toBeInTheDocument()
    expect(within(backstage).getByText(/product team owns the content/i)).toBeInTheDocument()
  })

  it('keeps the guiding belief by itself in the blue Why section', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    const build = screen.getByTestId('faq-build-iceberg')
    const belief = screen.getByTestId('faq-build-closing')
    const why = screen.getByTestId('faq-why')
    const signals = screen.getByTestId('faq-signals')
    const beliefCopy =
      'Reflection only helps when students choose it. We want My World to earn their trust without pressure or endless engagement. Feedback and evidence will keep shaping the design.'

    expect(within(build).queryByText(/Reflection only helps/i)).not.toBeInTheDocument()
    expect(belief).toHaveTextContent(beliefCopy)
    expect(why).toContainElement(belief)
    expect(why).toHaveClass('bg-(--color-faq-blue-deep)')
    expect(why.querySelector('blockquote')).toBeNull()
    expect(why.textContent).not.toMatch(/[“”"]/u)
    expect(within(why).queryByText(/small signals over time/i)).not.toBeInTheDocument()
    expect(within(why).queryByText(/does not replace a clinical test/i)).not.toBeInTheDocument()
    expect(within(why).queryByText(/Concern is part of the work/i)).not.toBeInTheDocument()
    expect(within(signals).getByText(/Concern is part of the work/i)).toBeInTheDocument()
  })

  it('keeps all six topics and all 34 canonical questions in the card grid', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    expect(screen.getAllByTestId('faq-question-cluster')).toHaveLength(FAQ_CONCERN_CLUSTERS.length)
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(FAQ_QUESTIONS.length)
    expect(FAQ_CONCERN_CLUSTERS).toHaveLength(6)
    expect(FAQ_QUESTIONS).toHaveLength(34)
  })

  it('shows the review posture counts as information rather than anchor links', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    const posture = screen.getByTestId('faq-posture')
    expect(within(posture).queryByRole('link')).not.toBeInTheDocument()
    expect(within(posture).getByText(/Each answer shows what supports it/i)).toBeInTheDocument()
    expect(within(posture).getAllByText('questions covered')).toHaveLength(2)
    expect(within(posture).getAllByText('comments from sessions')).toHaveLength(2)
  })

  it('flips to a short answer, then opens its evidence and limits', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    const question = screen.getByRole('button', {
      name: 'What first decision context is the team proposing to explore?',
    })
    expect(question).toHaveAttribute('aria-expanded', 'false')

    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    const questionCard = question.closest<HTMLElement>('[data-testid="faq-question-card"]')
    if (!questionCard) throw new Error('FAQ question card was not found')
    const shortAnswer = within(questionCard).getByTestId('faq-short-answer')
    expect(shortAnswer).toHaveTextContent(/subject combination/i)
    await waitFor(() => expect(shortAnswer.parentElement).toHaveFocus())

    const evidenceTrigger = within(questionCard).getByRole('button', {
      name: 'Read the evidence',
    })
    await user.click(evidenceTrigger)
    const dialog = screen.getByRole('dialog', {
      name: 'What first decision context is the team proposing to explore?',
    })
    expect(within(dialog).getAllByTestId('faq-evidence-label').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText(/^Limit:/i).length).toBeGreaterThan(0)

    await user.click(within(dialog).getByRole('button', { name: 'Close answer details' }))
    await waitFor(() => expect(evidenceTrigger).toHaveFocus())

    await user.click(within(questionCard).getByRole('button', { name: 'Back to question' }))
    await waitFor(() => expect(question).toHaveFocus())
    expect(question).toHaveAttribute('aria-expanded', 'false')
  })

  it('moves the small-captures rationale into an evidence FAQ card', async () => {
    const user = userEvent.setup()
    const questionText = 'Why capture small moments instead of relying on one long survey?'
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    await user.click(screen.getByRole('tab', { name: 'Evidence and the next decision' }))

    const question = screen.getByRole('button', { name: questionText })
    await user.click(question)
    const questionCard = question.closest<HTMLElement>('[data-testid="faq-question-card"]')
    if (!questionCard) throw new Error('Small-captures FAQ card was not found')
    expect(within(questionCard).getByTestId('faq-short-answer')).toHaveTextContent(
      /Brief captures may preserve changing context and reveal patterns across days/i,
    )
    expect(within(questionCard).getByTestId('faq-short-answer')).toHaveTextContent(
      /design rationale, not proof/i,
    )

    await user.click(within(questionCard).getByRole('button', { name: 'Read the evidence' }))
    const dialog = screen.getByRole('dialog', { name: questionText })
    const frequencyDetails = within(dialog).getByTestId('faq-frequency-details')

    expect(within(frequencyDetails).getByText('One detailed check')).toBeInTheDocument()
    expect(within(frequencyDetails).getByText('Small captures over time')).toBeInTheDocument()
    expect(
      within(frequencyDetails).getByRole('link', { name: /Apple Heart Study/i }),
    ).toHaveAttribute('href', 'https://www.nejm.org/doi/10.1056/NEJMoa1901183')
    expect(within(frequencyDetails).getByText(/share honest moments/i)).toBeInTheDocument()
    expect(
      within(frequencyDetails).getByText(
        /A pilot must compare its value and burden with simpler options/i,
      ),
    ).toBeInTheDocument()
  })

  it('renders hostile question and answer strings literally through the card and dialog', async () => {
    const user = userEvent.setup()
    const executionKey = '__myWorldFaqHostileExecuted'
    ;(globalThis as Record<string, unknown>)[executionKey] = false
    const hostileQuestion =
      'Will <script>globalThis.__myWorldFaqHostileExecuted=true</script> stay text?'
    const hostileAnswer =
      'This answer keeps <img data-faq-hostile src=x onerror="globalThis.__myWorldFaqHostileExecuted=true"> as literal author text while the team reviews every claim and limitation carefully.'
    const hostileDetails =
      'Detailed text: <script data-faq-hostile>globalThis.__myWorldFaqHostileExecuted=true</script>'
    const hostileLimits =
      'Limit: <iframe data-faq-hostile srcdoc="<script>globalThis.__myWorldFaqHostileExecuted=true</script>"></iframe>'
    const content = addTeamFaqQuestion(structuredClone(DEFAULT_MY_WORLD_FAQ_CONTENT), {
      id: 'team-11111111-1111-4111-8111-111111111111',
      clusterId: 'evidence-next-decision',
      displayedQuestion: hostileQuestion,
      shortAnswer: hostileAnswer,
      detailedAnswer: hostileDetails,
      limitations: hostileLimits,
      reviewDate: '2026-07-30',
    })
    render(<MyWorldFaqPage feedbackEnabled={false} content={content} />)

    await user.click(screen.getByRole('tab', { name: 'Evidence and the next decision' }))
    const trigger = screen.getByRole('button', { name: hostileQuestion })
    await user.click(trigger)
    const card = trigger.closest<HTMLElement>('[data-testid="faq-question-card"]')
    if (!card) throw new Error('FAQ question card was not found')
    expect(within(card).getByTestId('faq-short-answer')).toHaveTextContent(hostileAnswer)

    await user.click(within(card).getByRole('button', { name: 'Read the evidence' }))
    const dialog = screen.getByRole('dialog', { name: hostileQuestion })
    expect(within(dialog).getByText(hostileDetails)).toBeInTheDocument()
    expect(within(dialog).getByText(hostileLimits)).toBeInTheDocument()
    expect(document.querySelector('[data-faq-hostile]')).toBeNull()
    expect((globalThis as Record<string, unknown>)[executionKey]).toBe(false)
    delete (globalThis as Record<string, unknown>)[executionKey]
  })

  it('switches FAQ topics and shows the matching card set', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    await user.click(screen.getByRole('tab', { name: 'Privacy and governance' }))
    const panel = screen.getByRole('tabpanel', { name: 'Privacy and governance' })
    expect(within(panel).getAllByTestId('faq-question-trigger')).toHaveLength(6)
    expect(
      within(panel).getByRole('button', { name: 'Do model providers train on student data?' }),
    ).toBeInTheDocument()
  })

  it('uses quoted event concerns without rendering Pigeonhole screenshots', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    expect(screen.getByText(/anonymous event comments shaped this faq/i)).toBeInTheDocument()
    expect(screen.getByText(/are we replacing the dinner table conversation/i)).toBeInTheDocument()
    expect(screen.getByText(/not all students have a safe space at home/i)).toBeInTheDocument()
    expect(screen.getByText(/strong privacy guardrails/i)).toBeInTheDocument()
    expect(screen.queryByTestId('faq-signal-image')).not.toBeInTheDocument()
  })

  it('omits the pilot-stage hero panel while keeping the sharing posture', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} content={DEFAULT_MY_WORLD_FAQ_CONTENT} />)

    expect(screen.queryByText('Pilot under consideration')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/leadership has not decided whether to run one/i),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/anyone with this link can view or share it/i)).toBeInTheDocument()
    expect(screen.getByTestId('my-world-faq-page')).toHaveAttribute(
      'data-feedback-enabled',
      'false',
    )
    expect(screen.queryByTestId('faq-feedback-form')).not.toBeInTheDocument()
  })
})
