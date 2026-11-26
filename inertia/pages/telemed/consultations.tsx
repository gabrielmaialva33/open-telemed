import { Link } from '@inertiajs/react'
import { useState } from 'react'
import { CalendarDays, Plus, Video } from 'lucide-react'
import { ClinicLayout } from '~/components/telemed/clinic_layout'
import { CopyPatientLink } from '~/components/telemed/copy_patient_link'
import { ConsultationTable } from '~/components/telemed/consultation_table'
import { telemedRequest } from '~/components/telemed/api'
import {
  statusLabels,
  type Clinic,
  type Consultation,
  type Professional,
} from '~/components/telemed/types'

export default function ConsultationsPage({
  clinic,
  consultations,
  professionals,
  canManage,
}: {
  clinic: Clinic
  consultations: Consultation[]
  professionals: Professional[]
  canManage: boolean
}) {
  const [filter, setFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{
    patient_url: string
    consultation: Consultation
  } | null>(null)
  async function create(form: HTMLFormElement) {
    setError('')
    setBusy(true)
    const fields = Object.fromEntries(new FormData(form))
    try {
      setCreated(
        await telemedRequest('/consultations', {
          ...fields,
          professional_id: Number(fields.professional_id),
          scheduled_at: new Date(String(fields.scheduled_at)).toISOString(),
          patient_document: fields.patient_document || undefined,
        })
      )
      setShowForm(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const all = created ? [created.consultation, ...consultations] : consultations
  return (
    <ClinicLayout clinic={clinic} title="Consultas" manage={canManage}>
      <div className="page-title">
        <div>
          <span className="eyebrow">AGENDA DE ATENDIMENTOS</span>
          <h1>Consultas</h1>
          <p>Acompanhe cada paciente, da chegada ao cuidado.</p>
        </div>
        {canManage && (
          <button className="tm-button" onClick={() => setShowForm(!showForm)}>
            <Plus size={18} /> Nova consulta
          </button>
        )}
      </div>
      <div className="stat-grid">
        <div className="tm-card stat">
          <CalendarDays />
          <div>
            <strong>{all.length}</strong>
            <span>Consultas na agenda</span>
          </div>
        </div>
        <div className="tm-card stat">
          <Video />
          <div>
            <strong>{all.filter((c) => c.status === 'waiting').length}</strong>
            <span>Pacientes na espera</span>
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="tm-error">
          {error}
        </p>
      )}
      {created && (
        <div className="tm-card success-card">
          <h2>Consulta criada</h2>
          <p>Compartilhe o link diretamente com o paciente para que ele prepare o atendimento.</p>
          <CopyPatientLink key={created.patient_url} value={created.patient_url} />
          <Link className="tm-button" href={`/consultations/${created.consultation.id}`}>
            Abrir consulta
          </Link>
        </div>
      )}
      {showForm && (
        <form
          className="tm-card telemed-form"
          onSubmit={(e) => {
            e.preventDefault()
            void create(e.currentTarget)
          }}
        >
          <h2>Agendar teleconsulta</h2>
          <p className="muted">
            Preencha os dados do paciente e escolha o profissional responsável.
          </p>
          <div className="form-grid">
            <label>
              Nome do paciente
              <input name="patient_name" required maxLength={160} autoComplete="off" />
            </label>
            <label>
              Documento (opcional)
              <input name="patient_document" maxLength={32} autoComplete="off" />
            </label>
            <label>
              Local informado do atendimento
              <input
                name="patient_location"
                placeholder="Cidade e UF onde o paciente estará"
                required
              />
            </label>
            <label>
              Data e hora
              <input name="scheduled_at" type="datetime-local" required />
            </label>
            <label>
              Profissional
              <select name="professional_id" required>
                <option value="">Selecione</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · CRM {p.crm}/{p.crm_uf}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Identificador externo (opcional)
              <input name="external_id" maxLength={128} />
            </label>
          </div>
          <button className="tm-button" disabled={busy || !professionals.length}>
            Criar consulta
          </button>
          {!professionals.length && <p>Cadastre um profissional antes de agendar.</p>}
        </form>
      )}
      <section className="tm-card consultation-list">
        <div className="section-title">
          <h2>Seus atendimentos</h2>
          <span>Horário de Brasília</span>
        </div>
        <div className="list-filter">
          <label>
            Filtrar por status
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">Todos os status</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {all.filter((c) => filter === 'all' || c.status === filter).length} consulta(s) · até
            100 mais recentes
          </p>
        </div>
        <ConsultationTable
          consultations={all.filter((c) => filter === 'all' || c.status === filter)}
          filtered={filter !== 'all'}
          onClear={() => setFilter('all')}
        />
      </section>
    </ClinicLayout>
  )
}
