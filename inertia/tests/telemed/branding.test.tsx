import { describe, expect, it, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import ClinicPage from '~/pages/telemed/clinic'

const { clinic, props } = vi.hoisted(() => {
  const clinic = {
    name: 'Aurora',
    slug: 'aurora',
    logo_url: null,
    primary_color: '#0f766e',
    accent_color: '#d1fae5',
    legal_name: 'Aurora Ltda',
    cnpj: '00.000.000/0001-00',
    crm_pj: '1000',
    crm_pj_uf: 'SP',
    technical_director_name: 'Ana',
    technical_director_crm: '123456',
    technical_director_uf: 'SP',
  }
  return {
    clinic,
    props: {
      clinic,
      auth: {
        user: { full_name: 'Ana', email: 'ana@example.test' },
        tenants: [{ ...clinic, id: 1, role: 'owner' }],
        activeTenantId: 1,
        permissions: ['dashboard.read', 'consultations.list', 'tenant_branding.update'],
      },
    },
  }
})
vi.mock('@inertiajs/react', () => ({
  usePage: () => ({ url: '/clinic', props }),
  Head: () => null,
  Link: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  router: { post: vi.fn() },
}))
vi.mock('~/components/telemed/api', () => ({ telemedRequest: vi.fn(async () => ({})) }))

function page() {
  return (
    <ClinicPage
      clinic={clinic}
      settings={{ ...clinic, custom_hosts: [], webhook_url: null, has_webhook_secret: false }}
      term={{
        version: 1,
        hash: 'hash',
        body: 'Termo sintético para testar a configuração da clínica.',
      }}
    />
  )
}

describe('Clinic branding across the shell', () => {
  it('updates the sidebar and primary color immediately after saving the brand', async () => {
    const user = userEvent.setup()
    const { container } = render(page())
    await user.clear(screen.getByLabelText('Nome da clínica'))
    await user.type(screen.getByLabelText('Nome da clínica'), 'Aurora Nova')
    fireEvent.change(screen.getByLabelText('Cor principal'), { target: { value: '#6d48a5' } })
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }))
    await screen.findByRole('status')
    expect(
      within(screen.getByRole('complementary')).getByRole('link', { name: 'Aurora Nova' })
    ).toBeInTheDocument()
    expect(
      (container.querySelector('.demo1') as HTMLElement).style.getPropertyValue('--color-primary')
    ).toBe('#6d48a5')
  })
  it('keeps brand variables inside the tenant and user menu portals', async () => {
    const user = userEvent.setup()
    render(page())
    await user.click(screen.getByRole('button', { name: 'Trocar clínica' }))
    expect(screen.getByRole('menu').style.getPropertyValue('--color-primary')).toBe('#0f766e')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Abrir menu do usuário' }))
    expect(screen.getByRole('menu').style.getPropertyValue('--color-primary')).toBe('#0f766e')
  })
})
