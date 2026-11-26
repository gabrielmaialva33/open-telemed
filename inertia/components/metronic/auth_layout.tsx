// Derivado do Metronic v9.5.0 (Keenthemes), licença comercial: não redistribuir.
import { Link, usePage } from '@inertiajs/react'
import { CheckCircle2, HeartPulse, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, CardContent } from '~/components/ui/card'
import { ClinicBrand, LegalFooter } from '~/components/telemed/clinic_layout'
import { brandStyle } from '~/components/telemed/brand_style'
import type { Clinic } from '~/components/telemed/types'

interface AuthSplitLayoutProps {
  title: string
  subtitle: string
  panelTitle: string
  panelDescription: string
  features?: { title: string; description: string; icon?: LucideIcon }[]
  children: ReactNode
  footer?: ReactNode
}

export function AuthSplitLayout({
  title,
  subtitle,
  panelTitle,
  panelDescription,
  features = [],
  children,
  footer,
}: AuthSplitLayoutProps) {
  const { clinic } = usePage().props as { clinic?: Clinic }
  return (
    <div
      className="telemed grid min-h-dvh grow bg-muted/30 lg:grid-cols-2"
      style={brandStyle(clinic)}
    >
      <div className="flex min-w-0 flex-col items-center justify-center p-5 lg:p-10">
        <Link href="/" className="mb-8">
          <ClinicBrand clinic={clinic || null} />
        </Link>
        <Card className="w-full max-w-[420px]">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-7">
              <h1>{title}</h1>
              <p className="mt-3 text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
            {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
          </CardContent>
        </Card>
        <LegalFooter clinic={clinic || null} />
      </div>
      <div className="relative m-5 hidden flex-col justify-center overflow-hidden rounded-xl border border-border bg-primary/5 p-12 lg:flex xl:p-16">
        <div className="absolute -end-24 -top-24 size-96 rounded-full border-[60px] border-primary/5" />
        <HeartPulse className="mb-10 size-14 text-primary" strokeWidth={1.3} />
        <h2 className="relative max-w-md !text-4xl !font-semibold leading-tight">
          {clinic ? `Bem-vindo à ${clinic.name}` : panelTitle}
        </h2>
        <p className="relative mt-5 max-w-md text-base text-muted-foreground">{panelDescription}</p>
        <ul className="relative mt-10 space-y-7">
          {features.map((feature) => {
            const Icon = feature.icon || CheckCircle2
            return (
              <li key={feature.title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
                  <Icon size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{feature.title}</p>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-14 text-xs text-muted-foreground">
          Cuidado próximo. Da chegada ao atendimento.
        </p>
      </div>
    </div>
  )
}
