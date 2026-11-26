import { useState } from 'react'
import { ClinicLayout, ClinicBrand, brandStyle } from '~/components/telemed/clinic_layout'
import { telemedRequest } from '~/components/telemed/api'
import type { Clinic, Term } from '~/components/telemed/types'
type Settings = Clinic & {
  custom_hosts: string[]
  webhook_url: string | null
  has_webhook_secret: boolean
}
export default function ClinicPage({
  clinic: initial,
  settings,
  term: initialTerm,
}: {
  clinic: Clinic
  settings: Settings
  term: Term
}) {
  const [clinic, setClinic] = useState(initial)
  const [preview, setPreview] = useState(initial)
  const [term, setTerm] = useState(initialTerm)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fields: [keyof Clinic, string][] = [
    ['name', 'Nome da clínica'],
    ['logo_url', 'URL do logo (HTTPS)'],
    ['legal_name', 'Razão social'],
    ['cnpj', 'CNPJ'],
    ['crm_pj', 'CRM-PJ'],
    ['crm_pj_uf', 'UF do CRM-PJ'],
    ['technical_director_name', 'Diretor técnico'],
    ['technical_director_crm', 'CRM do diretor técnico'],
    ['technical_director_uf', 'UF do diretor técnico'],
  ]
  async function save(form: HTMLFormElement) {
    setBusy(true)
    setError('')
    setMessage('')
    const data = Object.fromEntries(new FormData(form))
    const payload = {
      ...data,
      custom_hosts: String(data.custom_hosts)
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
      webhook_secret: data.webhook_secret || undefined,
      webhook_url: data.webhook_url || null,
      logo_url: data.logo_url || null,
    }
    try {
      await telemedRequest('/clinic', payload, 'PUT')
      setClinic({ ...clinic, ...data, logo_url: payload.logo_url } as Clinic)
      setMessage('Configurações salvas.')
      ;(form.elements.namedItem('webhook_secret') as HTMLInputElement).value = ''
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function publish(form: HTMLFormElement) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const next = await telemedRequest<Term>('/clinic/consent-texts', {
        body: new FormData(form).get('body'),
      })
      setTerm(next)
      setMessage(`Versão ${next.version} publicada. Aceites anteriores permanecem inalterados.`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ClinicLayout clinic={clinic} title="Configurações" manage>
      <div className="page-title">
        <div>
          <span className="eyebrow">IDENTIDADE E RESPONSABILIDADE</span>
          <h1>Clínica</h1>
          <p>Sua marca, com transparência para quem recebe o cuidado.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="tm-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="tm-success">
          {message}
        </p>
      )}
      <nav className="settings-nav" aria-label="Seções da clínica">
        <a href="#brand">Marca</a>
        <a href="#legal">Dados legais</a>
        <a href="#term">Termo</a>
        <a href="#webhook">Webhook</a>
      </nav>
      <form
        onChange={(event) => {
          const data = Object.fromEntries(new FormData(event.currentTarget))
          setPreview({
            ...clinic,
            ...data,
            logo_url: String(data.logo_url || '') || null,
          } as Clinic)
        }}
        className="tm-card telemed-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save(e.currentTarget)
        }}
      >
        <section id="brand" className="settings-section">
          <h2>Marca</h2>
          <p className="muted">Como a clínica aparece para a equipe e para o paciente.</p>
          <div className="brand-preview" style={brandStyle(preview)}>
            <span className="eyebrow">PRÉVIA DA MARCA</span>
            <ClinicBrand clinic={preview} />
            <span className="tm-button">Iniciar atendimento</span>
          </div>
          <div className="form-grid">
            {fields.slice(0, 2).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  defaultValue={settings[key] || ''}
                  required={key !== 'logo_url'}
                  maxLength={key.endsWith('_uf') ? 2 : 2048}
                />
              </label>
            ))}
            <label>
              Cor principal
              <input
                type="color"
                name="primary_color"
                defaultValue={settings.primary_color || '#0f766e'}
              />
            </label>
            <label>
              Cor de destaque
              <input
                type="color"
                name="accent_color"
                defaultValue={settings.accent_color || '#d1fae5'}
              />
            </label>
          </div>
        </section>
        <section id="legal" className="settings-section">
          <h2>Dados legais</h2>
          <p className="muted">Identificação exibida no rodapé de cada atendimento.</p>
          <div className="form-grid">
            {fields.slice(2).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  defaultValue={settings[key] || ''}
                  required
                  maxLength={key.endsWith('_uf') ? 2 : 2048}
                />
              </label>
            ))}
          </div>
        </section>
        <section className="settings-section">
          <h2>Endereço da clínica</h2>
          <label>
            Domínios personalizados (um por linha, sem protocolo)
            <textarea
              name="custom_hosts"
              defaultValue={settings.custom_hosts.join('\n')}
              rows={2}
            />
          </label>
        </section>
        <section id="webhook" className="settings-section">
          <h2>Webhook</h2>
          <p>
            Eventos de status são assinados e enviados com retentativas. O prontuário continua no
            sistema da clínica.
          </p>
          <label>
            URL do webhook
            <input name="webhook_url" type="url" defaultValue={settings.webhook_url || ''} />
          </label>
          <label>
            {settings.has_webhook_secret
              ? 'Novo segredo (deixe vazio para manter)'
              : 'Segredo de assinatura (mínimo 32 caracteres)'}
            <input
              name="webhook_secret"
              type="password"
              minLength={32}
              autoComplete="new-password"
            />
          </label>
        </section>
        <button className="tm-button" disabled={busy}>
          Salvar configurações
        </button>
      </form>
      <form
        id="term"
        className="tm-card telemed-form settings-section"
        onSubmit={(e) => {
          e.preventDefault()
          void publish(e.currentTarget)
        }}
      >
        <h2>Termo de consentimento · versão {term.version}</h2>
        <p>
          Publicar cria uma nova versão. O texto e o hash de cada aceite anterior serão preservados.
        </p>
        <textarea
          aria-label="Texto do termo de consentimento"
          name="body"
          defaultValue={term.body}
          key={term.version}
          rows={12}
          minLength={40}
          required
        />
        <button className="tm-button" disabled={busy}>
          Publicar nova versão do termo
        </button>
      </form>
    </ClinicLayout>
  )
}
