import { Head } from '@inertiajs/react'
import type { ReactNode } from 'react'
import { HeartPulse, ShieldCheck } from 'lucide-react'
import type { Clinic } from './types'
import { MainLayout } from '~/layouts/main_layout'
import { ClinicBrandContext } from './clinic_brand_context'
import '~/css/telemed.css'

import { brandStyle } from './brand_style'
export { brandStyle } from './brand_style'

export function ClinicBrand({ clinic }: { clinic: Clinic | null }) {
  return (
    <div className="clinic-brand">
      {clinic?.logo_url ? (
        <img src={clinic.logo_url} alt={`Logo ${clinic.name}`} />
      ) : (
        <span className="brand-symbol">
          <HeartPulse size={25} />
        </span>
      )}
      <div>
        <strong>{clinic?.name || 'Open Telemed'}</strong>
        <span>Cuidado perto de você</span>
      </div>
    </div>
  )
}
export function LegalFooter({ clinic }: { clinic: Clinic | null }) {
  return (
    <footer className="telemed-legal">
      <p>
        <ShieldCheck size={15} /> Atendimento com privacidade · Sem gravação
      </p>
      {clinic && (
        <>
          <p>
            {clinic.legal_name || clinic.name} · CNPJ {clinic.cnpj || 'não informado'}
          </p>
          <p>
            CRM-PJ {clinic.crm_pj || 'não informado'}/{clinic.crm_pj_uf || '—'} · Diretor técnico:{' '}
            {clinic.technical_director_name || 'não informado'} · CRM{' '}
            {clinic.technical_director_crm || '—'}/{clinic.technical_director_uf || '—'}
          </p>
        </>
      )}
    </footer>
  )
}
export function ClinicLayout({
  clinic,
  title,
  children,
}: {
  clinic: Clinic
  title: string
  children: ReactNode
  manage?: boolean
}) {
  return (
    <div className="telemed" style={brandStyle(clinic)}>
      <Head title={`${title} · ${clinic.name}`} />
      <ClinicBrandContext value={clinic}>
        <MainLayout>
          {children}
          <LegalFooter clinic={clinic} />
        </MainLayout>
      </ClinicBrandContext>
    </div>
  )
}
