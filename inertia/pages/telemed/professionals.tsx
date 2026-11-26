import { useState } from 'react'
import { router } from '@inertiajs/react'
import { ClinicLayout } from '~/components/telemed/clinic_layout'
import { telemedRequest } from '~/components/telemed/api'
import type { Clinic, Professional } from '~/components/telemed/types'
const states =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
export default function ProfessionalsPage({
  clinic,
  professionals,
  members,
}: {
  clinic: Clinic
  professionals: Professional[]
  members: { id: number; full_name: string }[]
}) {
  const [editing, setEditing] = useState<Professional | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [member, setMember] = useState('')
  async function save(form: HTMLFormElement) {
    setBusy(true)
    setError('')
    const data = Object.fromEntries(new FormData(form))
    try {
      await telemedRequest(
        editing ? `/professionals/${editing.id}` : '/professionals',
        {
          ...data,
          user_id: data.user_id ? Number(data.user_id) : undefined,
          rqe: data.rqe || null,
        },
        editing ? 'PUT' : 'POST'
      )
      router.reload()
      setEditing(null)
      form.reset()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ClinicLayout clinic={clinic} title="Profissionais" manage>
      <div className="page-title">
        <div>
          <span className="eyebrow">EQUIPE ASSISTENCIAL</span>
          <h1>Profissionais</h1>
          <p>Identificação profissional em cada teleconsulta.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="tm-error">
          {error}
        </p>
      )}
      <div className="consultation-details">
        <section className="tm-card">
          <h2>
            Médicos da clínica{' '}
            <span className="text-sm text-muted-foreground">({professionals.length})</span>
          </h2>
          {!professionals.length && (
            <div className="empty-state">
              <h3>Nenhum profissional cadastrado</h3>
              <p>Cadastre o primeiro médico para começar a agendar consultas.</p>
            </div>
          )}
          {professionals.map((p) => (
            <div className="professional-row" key={p.id}>
              <div>
                <strong>{p.full_name}</strong>
                <p>
                  CRM {p.crm}/{p.crm_uf}
                  {p.rqe ? ` · RQE ${p.rqe}` : ''}
                </p>
              </div>
              <button className="tm-button outline" onClick={() => setEditing(p)}>
                Editar
              </button>
            </div>
          ))}
        </section>
        <form
          className="tm-card telemed-form"
          key={editing?.id ?? 'new'}
          onSubmit={(e) => {
            e.preventDefault()
            void save(e.currentTarget)
          }}
        >
          <h2>{editing ? `Editar ${editing.full_name}` : 'Cadastrar profissional'}</h2>
          {!editing && (
            <>
              <label>
                Usuário
                <select name="user_id" value={member} onChange={(e) => setMember(e.target.value)}>
                  <option value="">Criar novo usuário médico</option>
                  {members
                    .filter((u) => !professionals.some((p) => p.user_id === u.id))
                    .map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                </select>
              </label>
              {!member && (
                <>
                  <label>
                    Nome completo
                    <input name="full_name" required />
                  </label>
                  <label>
                    E-mail
                    <input name="email" type="email" required />
                  </label>
                  <label>
                    Senha temporária (mínimo 12 caracteres)
                    <input
                      name="password"
                      type="password"
                      minLength={12}
                      required
                      autoComplete="new-password"
                    />
                  </label>
                </>
              )}
            </>
          )}
          <div className="form-grid">
            <label>
              CRM
              <input name="crm" defaultValue={editing?.crm} required pattern="[0-9]{4,10}" />
            </label>
            <label>
              UF
              <select name="crm_uf" defaultValue={editing?.crm_uf || 'SP'}>
                {states.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              RQE (opcional)
              <input name="rqe" defaultValue={editing?.rqe || ''} pattern="[0-9]{1,10}" />
            </label>
          </div>
          <p className="muted">
            O formato é conferido. A regularidade no CFM deve ser verificada pela clínica.
          </p>
          <button className="tm-button" disabled={busy}>
            Salvar profissional
          </button>
          {editing && (
            <button type="button" className="tm-button subtle" onClick={() => setEditing(null)}>
              Cancelar edição
            </button>
          )}
        </form>
      </div>
    </ClinicLayout>
  )
}
