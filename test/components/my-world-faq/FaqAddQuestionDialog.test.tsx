import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FaqAddQuestionDialog } from '~/components/my-world-faq/editor/FaqAddQuestionDialog'
import { DEFAULT_MY_WORLD_FAQ_CONTENT, FAQ_EDITORIAL_FIELD_LIMITS } from '~/data/my-world-faq'

describe('FaqAddQuestionDialog', () => {
  it('keeps the valid draft open when the defensive add guard rejects it', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn(() => 'Publish the current questions before adding another.')
    render(
      <FaqAddQuestionDialog
        document={DEFAULT_MY_WORLD_FAQ_CONTENT}
        limits={FAQ_EDITORIAL_FIELD_LIMITS}
        onAdd={onAdd}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Add question' }))
    const dialog = screen.getByRole('dialog', { name: 'Add a question' })
    fireEvent.change(within(dialog).getByLabelText('Topic'), {
      target: { value: 'evidence-next-decision' },
    })
    fireEvent.change(within(dialog).getByLabelText('Question'), {
      target: { value: 'How should the team review this question?' },
    })
    fireEvent.change(within(dialog).getByLabelText('Short answer'), {
      target: {
        value:
          'The team should retain this draft, explain the capacity limit clearly, and let the collaborator publish before trying to add another question.',
      },
    })
    fireEvent.change(within(dialog).getByLabelText('Detailed answer'), {
      target: { value: 'This working answer remains open to human review and correction.' },
    })
    fireEvent.change(within(dialog).getByLabelText('What still needs checking?'), {
      target: { value: 'The current draft must be published first.' },
    })
    await user.click(within(dialog).getByRole('button', { name: 'Add question' }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Add a question' })).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('How should the team review this question?'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Publish the current questions before adding another.',
    )
  })
})
