import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import ConsultationPage from '~/pages/telemed/consultation'
import type { Clinic, Consultation } from '~/components/telemed/types'

vi.mock('~/components/telemed/clinic_layout', () => ({
  ClinicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@inertiajs/react', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

const clinic: Clinic = {
  name: 'Clínica Sintética',
  slug: 'synthetic',
  logo_url: null,
  primary_color: null,
  accent_color: null,
  legal_name: null,
  cnpj: null,
  crm_pj: null,
  crm_pj_uf: null,
  technical_director_name: null,
  technical_director_crm: null,
  technical_director_uf: null,
}
const consultation: Consultation = {
  id: 1,
  patient_name: 'Paciente Sintético',
  patient_location: 'São Paulo/SP',
  scheduled_at: '2026-11-26T12:00:00Z',
  status: 'waiting',
  outcome: null,
  recording_allowed: false,
  consent: { version: 1, text_hash: 'hash', accepted_at: '2026-11-26T12:00:00Z' },
  professional: { name: 'Médico Responsável', crm: '123456', crm_uf: 'SP' },
}

describe('Clinical controls follow assigned-professional authorization', () => {
  it.each(['waiting', 'in_progress'])(
    'manager sees only administrative controls when %s',
    (status) => {
      render(
        <ConsultationPage
          clinic={clinic}
          consultation={{ ...consultation, status }}
          room={false}
          canManage
          canAttend={false}
        />
      )
      expect(screen.getByText('Paciente Sintético')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Admitir paciente' })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Entrar na sala de vídeo' })
      ).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Encerrar consulta' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Desfecho')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Abrir sala do médico' })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Sala de teleconsulta' })).not.toBeInTheDocument()
      if (status === 'waiting')
        expect(screen.getByRole('button', { name: 'Cancelar consulta' })).toBeEnabled()
      else
        expect(screen.queryByRole('button', { name: 'Cancelar consulta' })).not.toBeInTheDocument()
    }
  )

  it.each([
    ['waiting', 'Admitir paciente'],
    ['in_progress', 'Entrar na sala de vídeo'],
  ])('assigned owner retains clinical controls when %s', (status, action) => {
    render(
      <ConsultationPage
        clinic={clinic}
        consultation={{ ...consultation, status }}
        room={false}
        canManage
        canAttend
      />
    )
    expect(screen.getByRole('button', { name: action })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Encerrar consulta' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir sala do médico' })).toBeInTheDocument()
  })
})
