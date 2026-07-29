import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { FAQ_CONCERN_CLUSTERS, FAQ_QUESTIONS } from '~/data/my-world-faq'

describe('MyWorldFaqPage comprehension checkpoint', () => {
  it('separates Product at a glance and FAQ in the top navigation', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.getByRole('link', { name: 'Product at a glance' })).toHaveAttribute(
      'href',
      '#product',
    )
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq')
  })

  it('shows one active desktop product clip at a time with a poster and text equivalent', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} />)

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

  it('keeps all six topics and all 34 canonical questions in the card grid', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.getAllByTestId('faq-question-cluster')).toHaveLength(FAQ_CONCERN_CLUSTERS.length)
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(FAQ_QUESTIONS.length)
    expect(FAQ_CONCERN_CLUSTERS).toHaveLength(6)
    expect(FAQ_QUESTIONS).toHaveLength(34)
  })

  it('flips to a short answer, then opens its evidence and limits', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    const question = screen.getByRole('button', { name: 'What problem is it solving?' })
    expect(question).toHaveAttribute('aria-expanded', 'false')

    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    const questionCard = question.closest<HTMLElement>('[data-testid="faq-question-card"]')
    if (!questionCard) throw new Error('FAQ question card was not found')
    const shortAnswer = within(questionCard).getByTestId('faq-short-answer')
    expect(shortAnswer).toHaveTextContent(/low-effort capture and reviewable reflection/i)
    await waitFor(() => expect(shortAnswer.parentElement).toHaveFocus())

    const evidenceTrigger = within(questionCard).getByRole('button', {
      name: 'Evidence and limits',
    })
    await user.click(evidenceTrigger)
    const dialog = screen.getByRole('dialog', { name: 'What problem is it solving?' })
    expect(within(dialog).getAllByTestId('faq-evidence-label').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText(/^Limit:/i).length).toBeGreaterThan(0)

    await user.click(within(dialog).getByRole('button', { name: 'Close evidence' }))
    await waitFor(() => expect(evidenceTrigger).toHaveFocus())

    await user.click(within(questionCard).getByRole('button', { name: 'Back to question' }))
    await waitFor(() => expect(question).toHaveFocus())
    expect(question).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches FAQ topics and shows the matching card set', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    await user.click(screen.getByRole('tab', { name: 'Privacy and governance' }))
    const panel = screen.getByRole('tabpanel', { name: 'Privacy and governance' })
    expect(within(panel).getAllByTestId('faq-question-trigger')).toHaveLength(6)
    expect(
      within(panel).getByRole('button', { name: 'Do model providers train on student data?' }),
    ).toBeInTheDocument()
  })

  it('uses quoted event concerns without rendering Pigeonhole screenshots', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.getByText(/anonymous event comments shaped this faq/i)).toBeInTheDocument()
    expect(screen.getByText(/are we replacing the dinner table conversation/i)).toBeInTheDocument()
    expect(screen.getByText(/not all students have a safe space at home/i)).toBeInTheDocument()
    expect(screen.getByText(/strong privacy guardrails/i)).toBeInTheDocument()
    expect(screen.queryByTestId('faq-signal-image')).not.toBeInTheDocument()
  })

  it('omits the pilot-stage hero panel while keeping the sharing posture', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.queryByText('Pilot under consideration')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/leadership has not decided whether to run one/i),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/anyone with this link can open or forward it/i)).toBeInTheDocument()
    expect(screen.getByTestId('my-world-faq-page')).toHaveAttribute(
      'data-feedback-enabled',
      'false',
    )
    expect(screen.queryByTestId('faq-feedback-form')).not.toBeInTheDocument()
  })
})
