import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopyPatientLink } from '~/components/telemed/copy_patient_link'

describe('Patient link feedback', () => {
  it('confirms copying and keeps the full link available', async () => {
    const user = userEvent.setup()
    render(<CopyPatientLink value="https://clinic.example/c#synthetic" />)
    await user.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(screen.getByRole('status')).toHaveTextContent('Link copiado')
    expect(await navigator.clipboard.readText()).toBe('https://clinic.example/c#synthetic')
  })
  it('offers manual copying if clipboard access fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('Denied'))
    render(<CopyPatientLink value="https://clinic.example/c#synthetic" />)
    await user.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(screen.getByRole('status')).toHaveTextContent('copie manualmente')
    expect(screen.getByLabelText('Link do paciente')).toHaveValue(
      'https://clinic.example/c#synthetic'
    )
    expect(screen.queryByRole('button', { name: 'Copiado' })).not.toBeInTheDocument()
  })
})
