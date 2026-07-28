import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { FAQ_ASSETS, FAQ_CONCERN_CLUSTERS, FAQ_QUESTIONS } from '~/data/my-world-faq'

describe('MyWorldFaqPage comprehension checkpoint', () => {
  it('separates Product at a glance and FAQ in the top navigation', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.getByRole('link', { name: 'Product at a glance' })).toHaveAttribute(
      'href',
      '#product',
    )
    expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq')
  })

  it('shows the four full product screens without cropping them', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    const loop = screen.getByTestId('faq-product-loop')
    for (const step of ['Capture', 'Sensemake', 'Review', 'Act or return']) {
      expect(within(loop).getByRole('tab', { name: step })).toBeInTheDocument()
    }

    const productAssets = FAQ_ASSETS.filter((asset) => asset.kind === 'product-step')
    const productImages = within(loop).getAllByTestId('faq-product-image')
    expect(productAssets).toHaveLength(4)
    expect(productImages).toHaveLength(4)
    for (const [index, asset] of productAssets.entries()) {
      expect(productImages[index]).toHaveAttribute('src', asset.publicPath)
      expect(productImages[index]).toHaveAttribute('loading', 'lazy')
      expect(productImages[index]).toHaveAttribute('alt', asset.alt)
      expect(productImages[index]).toHaveClass('h-auto')
      expect(productImages[index]).not.toHaveClass('object-cover')
    }
  })

  it('keeps all six topics and all 34 canonical questions in the card accordion', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.getAllByTestId('faq-question-cluster')).toHaveLength(FAQ_CONCERN_CLUSTERS.length)
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(FAQ_QUESTIONS.length)
    expect(FAQ_CONCERN_CLUSTERS).toHaveLength(6)
    expect(FAQ_QUESTIONS).toHaveLength(34)
  })

  it('opens a short answer, then reveals its evidence and limits', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    const question = screen.getByRole('button', { name: 'What problem is it solving?' })
    expect(question).toHaveAttribute('aria-expanded', 'false')

    await user.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    const questionCard = question.closest<HTMLElement>('[data-slot="accordion-item"]')
    if (!questionCard) throw new Error('FAQ question card was not found')
    expect(within(questionCard).getByTestId('faq-short-answer')).toHaveTextContent(
      /low-effort capture and reviewable reflection/i,
    )

    const evidenceTrigger = within(questionCard).getByRole('button', {
      name: 'Evidence and limits',
    })
    expect(evidenceTrigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(evidenceTrigger)
    expect(evidenceTrigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(questionCard).getAllByTestId('faq-evidence-label').length).toBeGreaterThan(0)
    expect(within(questionCard).getAllByText(/^Limit:/i).length).toBeGreaterThan(0)
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

  it('keeps the stage and sharing posture concise and truthful', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.getByText('Pilot under consideration')).toBeInTheDocument()
    expect(screen.getByText(/leadership has not decided whether to run one/i)).toBeInTheDocument()
    expect(screen.getByText(/anyone with this link can open or forward it/i)).toBeInTheDocument()
    expect(screen.getByTestId('my-world-faq-page')).toHaveAttribute(
      'data-feedback-enabled',
      'false',
    )
    expect(screen.queryByTestId('faq-feedback-form')).not.toBeInTheDocument()
  })
})
