import { consumePatientLinkSecret } from '~/components/telemed/patient_link_secret'
import { Head, usePage } from '@inertiajs/react'
import { useEffect, useRef, useState } from 'react'
import { Clock3, ShieldCheck, Video } from 'lucide-react'
import { brandStyle, ClinicBrand, LegalFooter } from '~/components/telemed/clinic_layout'
import { ConsentForm, type ConsentInput } from '~/components/telemed/consent_form'
import { DevicePreview } from '~/components/telemed/device_preview'
import { VideoRoom } from '~/components/telemed/video_room'
import { telemedRequest } from '~/components/telemed/api'
import {
  outcomeLabels,
  type Clinic,
  type Term,
  type VideoSession,
} from '~/components/telemed/types'

type PatientState = {
  clinic: Clinic
  consultation: {
    id: number
    status: string
    outcome: string | null
    consented: boolean
    admitted: boolean
    patient_name: string
  }
  term: Term
}
export default function PatientPage({ clinic: initialClinic }: { clinic: Clinic | null }) {
  const [state, setState] = useState<PatientState | null>(null)
  const [clinic, setClinic] = useState(initialClinic)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<VideoSession | null>(null)
  const [left, setLeft] = useState(false)
  const initialized = useRef(false)
  const { url } = usePage()
  const path = url.split(/[?#]/)[0]
  const base = path.startsWith('/t/') ? path.replace(/\/c$/, '/patient') : '/patient'
  const consultationId = useRef(new URLSearchParams(url.split('?')[1] || '').get('consultation_id'))
  const endpoint = (action: string) =>
    `${base}/${action}?consultation_id=${consultationId.current || ''}`
  const [preparation, setPreparation] = useState<'camera' | 'term'>('camera')
  async function refresh() {
    const data = await telemedRequest<PatientState>(endpoint('state'))
    setState(data)
    setClinic(data.clinic)
    if (['ended', 'cancelled'].includes(data.consultation.status)) setSession(null)
  }
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const secret = consumePatientLinkSecret()
    // Remove the bearer link from browser history before fetching any media.
    window.history.replaceState(null, '', window.location.pathname)
    const request = secret
      ? telemedRequest<PatientState>(`${base}/session`, { secret })
      : telemedRequest<PatientState>(endpoint('state'))
    void request
      .then((data) => {
        consultationId.current = String(data.consultation.id)
        window.history.replaceState(
          window.history.state,
          '',
          `${path}?consultation_id=${data.consultation.id}`
        )
        setState(data)
        setClinic(data.clinic)
      })
      .catch((e: Error) => setError(e.message))
  }, [base])
  useEffect(() => {
    if (!state || ['ended', 'cancelled'].includes(state.consultation.status)) return
    const id = setInterval(() => void refresh().catch((e: Error) => setError(e.message)), 2000)
    return () => clearInterval(id)
  }, [state?.consultation.status, base])
  async function join() {
    setBusy(true)
    setError('')
    try {
      setSession(await telemedRequest<VideoSession>(endpoint('video-token'), {}))
      setLeft(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    if (state?.consultation.status === 'in_progress' && !session && !left && !busy) void join()
  }, [state?.consultation.status])
  async function accept(input: ConsentInput) {
    setBusy(true)
    setError('')
    try {
      setState(await telemedRequest<PatientState>(endpoint('consent'), input))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  async function decline() {
    setBusy(true)
    setError('')
    try {
      await telemedRequest(endpoint('decline'), {})
      setSession(null)
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const status = state?.consultation.status
  const finished = status === 'ended' || status === 'cancelled'
  const step =
    status === 'in_progress' ? 3 : status === 'waiting' ? 2 : preparation === 'term' ? 1 : 0
  return (
    <div className="telemed patient-shell" style={brandStyle(clinic)}>
      <Head title={`Teleconsulta · ${clinic?.name || 'Open Telemed'}`} />
      <header className="patient-header">
        <ClinicBrand clinic={clinic} />
        <span className="secure-label">
          <ShieldCheck size={16} /> Ambiente privado
        </span>
      </header>
      <main className="patient-main">
        <div className="patient-intro">
          <span className="eyebrow">SUA TELECONSULTA</span>
          <h1>
            {state ? `Olá, ${state.consultation.patient_name}.` : 'Bem-vindo ao seu atendimento.'}
          </h1>
          <p>Cuidado de verdade, onde você estiver.</p>
        </div>
        <ol className="patient-steps" aria-label="Etapas da consulta">
          {['Câmera', 'Termo', 'Espera', 'Vídeo'].map((label, index) => (
            <li
              className={index === step && !finished ? 'active' : index < step ? 'complete' : ''}
              aria-current={index === step && !finished ? 'step' : undefined}
              key={label}
            >
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        {error && (
          <p role="alert" className="tm-error">
            {error}
          </p>
        )}
        {!state && !error && <p role="status">Carregando seu atendimento…</p>}
        {state && status === 'scheduled' && (
          <section className="tm-card patient-step-card">
            {preparation === 'camera' ? (
              <>
                <div className="step-heading">
                  <span className="eyebrow">ETAPA 1 DE 4</span>
                  <h2>Prepare sua câmera e microfone</h2>
                  <p className="muted">Escolha um lugar tranquilo. Este teste fica só com você.</p>
                </div>
                <DevicePreview />
                <button className="tm-button patient-next" onClick={() => setPreparation('term')}>
                  Continuar para o termo
                </button>
              </>
            ) : (
              <>
                <button
                  aria-label="Voltar à câmera"
                  className="back-link"
                  onClick={() => setPreparation('camera')}
                >
                  ← Voltar à câmera
                </button>
                <ConsentForm
                  term={state.term}
                  onAccept={(input) => void accept(input)}
                  busy={busy}
                />
              </>
            )}
          </section>
        )}
        {status === 'waiting' && (
          <section className="tm-card waiting-card">
            <span className="waiting-icon">
              <Clock3 size={36} />
            </span>
            <span className="eyebrow">TUDO PRONTO</span>
            <h2>Você está na sala de espera</h2>
            <p>
              Seu consentimento foi registrado. O médico será avisado e admitirá você assim que
              estiver pronto.
            </p>
            <div className="waiting-pulse" role="status">
              Aguardando o médico · atualização automática
            </div>
            <p className="muted">Sua câmera e seu microfone ainda não estão sendo transmitidos.</p>
          </section>
        )}
        {status === 'in_progress' &&
          (session ? (
            <VideoRoom
              session={session}
              onLeave={() => {
                setSession(null)
                setLeft(true)
              }}
            />
          ) : (
            <section className="tm-card waiting-card">
              <Video size={36} />
              <h2>O médico admitiu você</h2>
              <button className="tm-button" disabled={busy} onClick={() => void join()}>
                Entrar no atendimento
              </button>
            </section>
          ))}
        {finished && (
          <section className="tm-card waiting-card">
            <ShieldCheck size={40} />
            <h2>{status === 'cancelled' ? 'Consulta cancelada' : 'Consulta encerrada'}</h2>
            <p>
              {state?.consultation.outcome
                ? outcomeLabels[state.consultation.outcome]
                : 'Entre em contato com a clínica para combinar o próximo atendimento.'}
            </p>
            <p className="muted">
              Obrigado pela confiança. A clínica está à disposição para os próximos passos.
            </p>
          </section>
        )}
        {state && !finished && (
          <div className="patient-decline">
            <button className="tm-button subtle" disabled={busy} onClick={() => void decline()}>
              Prefiro atendimento presencial
            </button>
            <p>Esta escolha encerra a teleconsulta e informa a clínica.</p>
          </div>
        )}
      </main>
      <LegalFooter clinic={clinic} />
    </div>
  )
}
