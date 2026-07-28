import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MyWorldFaqPage } from '~/components/my-world-faq/MyWorldFaqPage'
import { FAQ_ASSETS, FAQ_CONCERN_CLUSTERS, FAQ_QUESTIONS } from '~/data/my-world-faq'

describe('MyWorldFaqPage comprehension checkpoint', () => {
  it('explains the current four-step loop and its product boundaries', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    const loop = screen.getByTestId('faq-product-loop')
    for (const step of ['Capture', 'Sensemake', 'Review', 'Act / Return']) {
      expect(within(loop).getByRole('heading', { name: step })).toBeInTheDocument()
    }
    expect(within(loop).getByText(/Connector happens later/i)).toBeInTheDocument()
    expect(within(loop).getByText(/capture-count-driven/i)).toBeInTheDocument()
    expect(
      within(loop).getByText(/not task tracking or proof of follow-through/i),
    ).toBeInTheDocument()

    const productAssets = FAQ_ASSETS.filter((asset) => asset.kind === 'product-step')
    const productImages = within(loop).getAllByTestId('faq-product-image')
    expect(productAssets).toHaveLength(4)
    expect(productImages).toHaveLength(4)
    for (const [index, asset] of productAssets.entries()) {
      expect(productImages[index]).toHaveAttribute('src', asset.publicPath)
      expect(productImages[index]).toHaveAttribute('loading', 'lazy')
      expect(productImages[index]).toHaveAttribute('alt', asset.alt)
      expect(asset.transcript).toMatch(/synthetic demo data/i)
    }
  })

  it('shows all six clusters and all 34 canonical question triggers', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(screen.getAllByTestId('faq-question-cluster')).toHaveLength(FAQ_CONCERN_CLUSTERS.length)
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(FAQ_QUESTIONS.length)
    expect(FAQ_CONCERN_CLUSTERS).toHaveLength(6)
    expect(FAQ_QUESTIONS).toHaveLength(34)
  })

  it('defaults to the dinner-table answer, then exposes structured evidence in a native second layer', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    const dinnerTable = screen.getByRole('button', {
      name: 'Keep the dinner table bigger than the product',
    })
    expect(dinnerTable).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('faq-answer-title')).toHaveTextContent(
      'Keep the dinner table bigger than the product',
    )
    expect(screen.getByTestId('faq-short-answer')).toHaveTextContent(
      /measure whether use prompts, coexists with or displaces family/i,
    )

    const details = screen.getByTestId('faq-evidence-details')
    expect(details).not.toHaveAttribute('open')
    const summary = within(details)
      .getByText(/how we know/i)
      .closest('summary')
    expect(summary?.tagName).toBe('SUMMARY')
    const evidenceDetails = details as HTMLDetailsElement
    evidenceDetails.open = true
    expect(details).toHaveAttribute('open')

    const evidenceLabels = within(details)
      .getAllByTestId('faq-evidence-label')
      .map((node) => node.textContent)
    expect(evidenceLabels).toEqual(
      expect.arrayContaining(['Product fact', 'Research-backed', 'Open question · pilot']),
    )
    expect(within(details).getAllByText('Fit')).not.toHaveLength(0)
    expect(within(details).getAllByText('Limitation')).not.toHaveLength(0)
    expect(within(details).getAllByText(/last reviewed/i)).not.toHaveLength(0)

    const researchLink = within(details).getByRole('link', {
      name: /How AI and Human Behaviors Shape Psychosocial Effects/i,
    })
    expect(researchLink).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/scale\.stanford\.edu\//),
    )
  })

  it('filters the question field without turning aliases into new canonical questions', async () => {
    const user = userEvent.setup()
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: /concern cluster/i }),
      'privacy-governance',
    )
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(6)
    expect(
      screen.getByRole('button', { name: 'Provider terms must be checked, not inferred' }),
    ).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: /search questions/i }))
    await user.type(screen.getByRole('searchbox', { name: /search questions/i }), 'provider terms')
    expect(screen.getAllByTestId('faq-question-trigger')).toHaveLength(1)
  })

  it('renders all six reviewed event signals as contextual, lazy, openable sources', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    expect(
      screen.getByText(/anonymous event feedback is a source of questions, not a representative/i),
    ).toBeInTheDocument()

    const images = screen.getAllByTestId('faq-signal-image')
    const eventSignals = FAQ_ASSETS.filter((asset) => asset.kind === 'event-signal')
    expect(images).toHaveLength(6)
    expect(eventSignals).toHaveLength(6)
    for (const [index, asset] of eventSignals.entries()) {
      expect(asset.kind).toBe('event-signal')
      expect(asset.approval).toBe('team-check')
      expect(images[index]).toHaveAttribute('src', `/my-world-faq/signals/signal-0${index + 1}.png`)
      expect(images[index]).toHaveAttribute('loading', 'lazy')
      expect(images[index]).toHaveAttribute('width', String(asset.width))
      expect(images[index]).toHaveAttribute('height', String(asset.height))
      expect(images[index]).toHaveAttribute('alt', asset.alt)
      expect(screen.getByText(asset.transcript)).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: `Open event signal ${index + 1} at full size` }),
      ).toHaveAttribute('href', asset.publicPath)
    }
  })

  it('previews all three guardrail states and keeps feedback visibly disabled', () => {
    render(<MyWorldFaqPage feedbackEnabled={false} />)

    const ledger = screen.getByTestId('faq-guardrail-preview')
    expect(within(ledger).getByText('Built today')).toBeInTheDocument()
    expect(within(ledger).getByText('Required before any pilot')).toBeInTheDocument()
    expect(within(ledger).getByText('Still researching')).toBeInTheDocument()

    expect(screen.getByText(/feedback is currently disabled/i)).toBeInTheDocument()
    expect(screen.queryByTestId('faq-feedback-form')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit feedback/i })).not.toBeInTheDocument()
  })
})
