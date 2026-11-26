import { Head, Link, router } from '@inertiajs/react'
import { useEffect } from 'react'
import { CalendarDays, Clock3, CheckCircle2, ArrowRight } from 'lucide-react'
import { MainLayout } from '~/layouts'
import { useAuth } from '~/hooks/use_auth'
import { ConsultationTable } from '~/components/telemed/consultation_table'
import type { Consultation } from '~/components/telemed/types'

type Overview = {
  today: (Consultation & { canAttend: boolean })[]
  waiting: (Consultation & { canAttend: boolean })[]
  upcoming: (Consultation & { canAttend: boolean })[]
  canManage: boolean
  available: boolean
  date: string
}

export default function DashboardPage({ overview }: { overview: Overview }) {
  const { user, activeTenant } = useAuth()
  useEffect(() => {
    if (!overview.available) return
    const timer = setInterval(() => router.reload({ only: ['overview'] }), 10000)
    return () => clearInterval(timer)
  }, [overview.available])
  return (
    <MainLayout>
      <Head title="Início" />
      <div className="page-title">
        <div>
          <span className="eyebrow">
            {overview.canManage ? 'VISÃO DA CLÍNICA' : 'SUA AGENDA'} · {overview.date}
          </span>
          <h1>Início</h1>
          <p>
            Olá, {user?.full_name.split(' ')[0] || 'bem-vindo'}.{' '}
            {activeTenant
              ? `Vamos cuidar de quem chega à ${activeTenant.name}.`
              : 'Selecione uma clínica para começar.'}
          </p>
        </div>
        {overview.available && (
          <Link className="tm-button" href="/consultations">
            {overview.canManage ? 'Gerenciar agenda' : 'Ver minhas consultas'}
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {!overview.available ? (
        <div className="tm-card empty-state">
          <h2>Bem-vindo ao seu painel</h2>
          <p>A agenda fica disponível para quem tem acesso às consultas da clínica.</p>
        </div>
      ) : (
        <>
          <div className="overview-stats">
            {[
              { label: 'Consultas hoje', value: overview.today.length, icon: CalendarDays },
              { label: 'Na espera agora', value: overview.waiting.length, icon: Clock3 },
              {
                label: 'Encerradas da agenda de hoje',
                value: overview.today.filter((c) => c.status === 'ended').length,
                icon: CheckCircle2,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div className="tm-card stat" key={label}>
                <span className="stat-icon">
                  <Icon />
                </span>
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              </div>
            ))}
          </div>
          <section className="tm-card waiting-panel">
            <div className="section-title">
              <div>
                <h2 className="flex items-center gap-2">
                  <span className="live-dot" />
                  Sala de espera
                </h2>
                <p className="muted mt-1">
                  {overview.canManage
                    ? 'Acompanhe a chegada dos pacientes à clínica.'
                    : 'Seus pacientes prontos para serem recebidos.'}
                </p>
              </div>
              <span>Atualiza a cada 10 s</span>
            </div>
            {overview.waiting.length ? (
              <ConsultationTable consultations={overview.waiting} roomActions />
            ) : (
              <p className="py-8 text-sm text-muted-foreground">
                Nenhum paciente aguardando agora. As chegadas aparecerão aqui.
              </p>
            )}
          </section>
          <section className="tm-card">
            <div className="section-title">
              <h2>Consultas de hoje</h2>
              <span>Horário de Brasília</span>
            </div>
            <ConsultationTable consultations={overview.today} />
          </section>
          <section className="tm-card">
            <div className="section-title">
              <h2>Próximas consultas</h2>
              <span>A partir de amanhã · até 6 consultas</span>
            </div>
            <ConsultationTable consultations={overview.upcoming} />
          </section>
        </>
      )}
    </MainLayout>
  )
}
