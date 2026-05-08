import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmAndSave } from '~/components/ConfirmAndSave'
import { EditableField } from '~/components/EditableField'

afterEach(() => {
  vi.useRealTimers()
})

describe('EditableField', () => {
  it('toggles to a textarea on Edit and back to display on Cancel without firing onConfirm', async () => {
    const onConfirm = vi.fn()
    render(<EditableField value="original" onConfirm={onConfirm} />)
    expect(screen.queryByTestId('editable-textarea')).toBeNull()

    await userEvent.click(screen.getByTestId('edit-button'))
    expect(screen.getByTestId('editable-textarea')).toHaveValue('original')

    await userEvent.clear(screen.getByTestId('editable-textarea'))
    await userEvent.type(screen.getByTestId('editable-textarea'), 'changed')
    await userEvent.click(screen.getByTestId('cancel-button'))

    expect(screen.queryByTestId('editable-textarea')).toBeNull()
    expect(screen.getByText('original')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('fires onConfirm with the trimmed draft and exits edit mode', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<EditableField value="original" onConfirm={onConfirm} />)

    await userEvent.click(screen.getByTestId('edit-button'))
    await userEvent.clear(screen.getByTestId('editable-textarea'))
    await userEvent.type(screen.getByTestId('editable-textarea'), '  changed  ')
    await userEvent.click(screen.getByTestId('confirm-button'))

    expect(onConfirm).toHaveBeenCalledWith('changed')
    await waitFor(() => expect(screen.queryByTestId('editable-textarea')).toBeNull())
  })

  it('disables Confirm when the trimmed draft is shorter than minLength', async () => {
    render(<EditableField value="original" minLength={3} onConfirm={vi.fn()} />)
    await userEvent.click(screen.getByTestId('edit-button'))
    await userEvent.clear(screen.getByTestId('editable-textarea'))
    await userEvent.type(screen.getByTestId('editable-textarea'), 'ab')
    expect(screen.getByTestId('confirm-button')).toBeDisabled()
  })
})

describe('ConfirmAndSave', () => {
  function makeWrapper() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    }
  }

  it('round-trips a TanStack Query mutation against a mock and reflects the new value', async () => {
    const mutationFn = vi.fn(async (input: { next: string }) => {
      return { ok: true, stored: input.next }
    })

    function TestHarness() {
      const [stored, setStored] = require('react').useState('before') as [
        string,
        (v: string) => void,
      ]
      return (
        <ConfirmAndSave
          value={stored}
          buildInput={(next) => ({ next })}
          mutationFn={async (input: { next: string }) => {
            const result = await mutationFn(input)
            setStored(result.stored)
            return result
          }}
        />
      )
    }

    render(<TestHarness />, { wrapper: makeWrapper() })
    await userEvent.click(screen.getByTestId('edit-button'))
    await userEvent.clear(screen.getByTestId('editable-textarea'))
    await userEvent.type(screen.getByTestId('editable-textarea'), 'after')
    await userEvent.click(screen.getByTestId('confirm-button'))

    await waitFor(() => expect(mutationFn).toHaveBeenCalledWith({ next: 'after' }))
    await waitFor(() => expect(screen.queryByTestId('editable-textarea')).toBeNull())
    expect(screen.getByText('after')).toBeInTheDocument()
  })

  it('rolls back optimistic value and surfaces error on mutation rejection', async () => {
    const mutationFn = vi.fn().mockRejectedValue(new Error('boom'))

    render(
      <ConfirmAndSave value="before" buildInput={(next) => ({ next })} mutationFn={mutationFn} />,
      { wrapper: makeWrapper() },
    )

    await userEvent.click(screen.getByTestId('edit-button'))
    await userEvent.clear(screen.getByTestId('editable-textarea'))
    await userEvent.type(screen.getByTestId('editable-textarea'), 'after')
    await userEvent.click(screen.getByTestId('confirm-button'))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('boom'))
    // Field still in editing state after error so the user can retry/cancel.
    expect(screen.getByTestId('editable-textarea')).toHaveValue('after')
  })
})
