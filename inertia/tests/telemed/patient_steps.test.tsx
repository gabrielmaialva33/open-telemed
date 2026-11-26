import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { telemedRequest } from '~/components/telemed/api'
import PatientPage from '~/pages/telemed/patient'

vi.mock('@inertiajs/react', () => ({
  Head: () => null,
  usePage: () => ({ url: '/t/aurora/c?consultation_id=42', props: {} }),
}))
vi.mock('~/components/telemed/clinic_layout', () => ({
  brandStyle: () => ({}),
  ClinicBrand: () => <span>Aurora</span>,
  LegalFooter: () => <footer>Dados legais</footer>,
}))
vi.mock('~/components/telemed/api', () => ({
  telemedRequest: vi.fn(async () => ({
    clinic: { name: 'Aurora' },
    consultation: {
      id: 42,
      status: 'scheduled',
      patient_name: 'Marina',
      consented: false,
      admitted: false,
    },
    term: { version: 1, hash: 'hash', body: 'Termo sintético' },
  })),
}))

describe('Patient steps', () => {
  it('shows camera and term separately, keeps consent unchecked and allows returning', async () => {
    const user = userEvent.setup()
    render(<PatientPage clinic={null} />)
    expect(await screen.findByRole('button', { name: 'Testar câmera e microfone' })).toBeVisible()
    expect(screen.queryByRole('checkbox', { name: /Li e aceito/ })).not.toBeInTheDocument()
    expect(screen.getByText('Dados legais')).toBeVisible()
    expect(telemedRequest).toHaveBeenCalledWith('/t/aurora/patient/state?consultation_id=42')
    expect(window.location.search).toBe('?consultation_id=42')
    await user.click(screen.getByRole('button', { name: 'Continuar para o termo' }))
    expect(
      screen.queryByRole('button', { name: 'Testar câmera e microfone' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Li e aceito/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Aceitar e entrar na espera' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: /Autorizaria gravação/ })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Voltar à câmera' }))
    expect(screen.getByRole('button', { name: 'Testar câmera e microfone' })).toBeVisible()
  })
})
