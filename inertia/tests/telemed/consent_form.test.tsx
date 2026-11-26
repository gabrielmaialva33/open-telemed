import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentForm } from '~/components/telemed/consent_form'

describe('Explicit patient consent', () => {
  it('requires a separate explicit acceptance and leaves recording off', async () => {
    const onAccept = vi.fn()
    render(
      <ConsentForm
        term={{ version: 2, hash: 'abc', body: 'Autorizo a teleconsulta.' }}
        onAccept={onAccept}
        busy={false}
      />
    )
    const submit = screen.getByRole('button', { name: 'Aceitar e entrar na espera' })
    expect(submit).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /gravação/i })).not.toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: /Li e aceito/i }))
    await userEvent.click(submit)
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        accepted: true,
        version: 2,
        text_hash: 'abc',
        recording_allowed: false,
      })
    )
  })
  it('recording preference alone does not authorize teleconsultation', async () => {
    render(
      <ConsentForm
        term={{ version: 1, hash: 'hash', body: 'Termo.' }}
        onAccept={vi.fn()}
        busy={false}
      />
    )
    await userEvent.click(screen.getByRole('checkbox', { name: /gravação/i }))
    expect(screen.getByRole('button', { name: 'Aceitar e entrar na espera' })).toBeDisabled()
  })
})
