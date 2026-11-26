import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import ConsultationsPage from '~/pages/telemed/consultations'
import ConsultationPage from '~/pages/telemed/consultation'
import type { Clinic, Consultation } from '~/components/telemed/types'

vi.mock('~/components/telemed/clinic_layout', () => ({
  ClinicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
  brandStyle: () => ({}),
}))
vi.mock('@inertiajs/react', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const clinic = { name: 'Aurora' } as Clinic
const consultation: Consultation = {
  id: 1,
  patient_name: 'Marina',
  patient_location: 'São Paulo/SP',
  scheduled_at: '2026-11-26T12:00:00Z',
  status: 'waiting',
  outcome: null,
  recording_allowed: false,
  consent: { version: 1, text_hash: 'hash', accepted_at: '2026-11-26T12:00:00Z' },
}

describe('Consultation UX', () => {
  it('filters the table by status and can clear an empty result', async () => {
    const user = userEvent.setup()
    render(
      <ConsultationsPage
        clinic={clinic}
        consultations={[consultation]}
        professionals={[]}
        canManage={false}
      />
    )
    expect(screen.getByRole('table')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Filtrar por status'), 'ended')
    expect(screen.queryByText('Marina')).not.toBeInTheDocument()
    expect(screen.getByText('Nenhuma consulta neste status')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Limpar filtro' }))
    expect(screen.getByText('Marina')).toBeInTheDocument()
  })

  it('opens outcome in a dialog without ending the consultation on open', async () => {
    const user = userEvent.setup()
    render(
      <ConsultationPage
        clinic={clinic}
        consultation={{ ...consultation, status: 'in_progress' }}
        room
        canManage={false}
        canAttend
      />
    )
    expect(screen.queryByLabelText('Desfecho')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Encerrar consulta' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Desfecho')).toHaveValue('completed')
    await user.click(screen.getByRole('button', { name: 'Continuar atendimento' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
