import { useEffect, useState } from 'react'
import { Link } from '@inertiajs/react'
import { CopyPatientLink } from '~/components/telemed/copy_patient_link'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '~/components/ui/dialog'
import { brandStyle } from '~/components/telemed/brand_style'
import { ClinicLayout } from '~/components/telemed/clinic_layout'
import { VideoRoom } from '~/components/telemed/video_room'
import { telemedRequest } from '~/components/telemed/api'
import {
  dateLabel,
  statusLabels,
  outcomeLabels,
  type Clinic,
  type Consultation,
  type VideoSession,
} from '~/components/telemed/types'

export default function ConsultationPage({
  clinic,
  consultation: initial,
  room,
  canManage,
  canAttend,
}: {
  clinic: Clinic
  consultation: Consultation
  room: boolean
  canManage: boolean
  canAttend: boolean
}) {
  const [c, setC] = useState(initial)
  const [session, setSession] = useState<VideoSession | null>(null)
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [ending, setEnding] = useState(false)
  const [outcome, setOutcome] = useState('completed')
  const base = `/consultations/${c.id}`
  const terminal = ['ended', 'cancelled'].includes(c.status)
  async function refresh() {
    const { data } = await telemedRequest<{ data: Consultation }>(base)
    setC(data)
    if (['ended', 'cancelled'].includes(data.status)) setSession(null)
  }
  useEffect(() => {
    if (terminal) return
    const timer = setInterval(() => void refresh().catch((e: Error) => setError(e.message)), 2000)
    return () => clearInterval(timer)
  }, [base, terminal])
  async function action(name: string, payload: unknown = {}) {
    setBusy(true)
    setError('')
    try {
      const result = await telemedRequest<VideoSession & { patient_url: string }>(
        `${base}/${name}`,
        payload
      )
      if (name === 'video-token') setSession(result)
      if (name === 'patient-link') setLink(result.patient_url)
      if (name === 'end' || name === 'cancel') {
        setSession(null)
        setEnding(false)
      }
      await refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <ClinicLayout
      clinic={clinic}
      title={room ? 'Sala do médico' : 'Detalhe da consulta'}
      manage={canManage}
    >
      <Link className="back-link" href="/consultations">
        ← Voltar às consultas
      </Link>
      <div className="page-title">
        <div>
          <span className="eyebrow">{room ? 'SALA DO MÉDICO' : `CONSULTA #${c.id}`}</span>
          <h1>{c.patient_name}</h1>
          <p>
            {dateLabel(c.scheduled_at)} · {c.patient_location}
          </p>
        </div>
        <span className={`status-badge ${c.status}`}>{statusLabels[c.status]}</span>
      </div>
      {error && (
        <p className="tm-error" role="alert">
          {error}
        </p>
      )}
      {canAttend && session && <VideoRoom session={session} onLeave={() => setSession(null)} />}
      <div className={`consultation-details ${room ? 'doctor-details' : ''}`}>
        <section className="tm-card">
          <h2>Atendimento</h2>
          <p>
            {c.professional?.name} · CRM {c.professional?.crm}/{c.professional?.crm_uf}
          </p>
          <p className="muted">Modalidade: teleconsulta · Gravação indisponível</p>
          <div className={`consent-status ${c.consent ? 'accepted' : ''}`}>
            {c.consent
              ? `✓ Consentimento registrado · versão ${c.consent.version}`
              : 'Aguardando o aceite do termo pelo paciente'}
          </div>
          {c.status === 'waiting' && (
            <p className="waiting-pulse">O paciente está na sala de espera.</p>
          )}
          {c.outcome && <p>{outcomeLabels[c.outcome]}</p>}
          {canAttend && !terminal && (
            <div className="button-row">
              {c.status === 'waiting' && (
                <button
                  className="tm-button"
                  onClick={() => void action('admit')}
                  disabled={busy || !c.consent}
                >
                  Admitir paciente
                </button>
              )}
              {c.status === 'in_progress' && !session && (
                <button
                  className="tm-button"
                  onClick={() => void action('video-token')}
                  disabled={busy}
                >
                  Entrar na sala de vídeo
                </button>
              )}
              {!room && (
                <Link className="tm-button outline" href={`${base}/room`}>
                  Abrir sala do médico
                </Link>
              )}
            </div>
          )}
        </section>
        {!terminal && (
          <section className="tm-card">
            <h2>Link do paciente</h2>
            <p>
              Compartilhe diretamente com o paciente. Cada novo link vale até um dia após o horário
              agendado.
            </p>
            <button
              className="tm-button outline"
              disabled={busy}
              onClick={() => void action('patient-link')}
            >
              Gerar link para copiar
            </button>
            {link && <CopyPatientLink key={link} value={link} />}
          </section>
        )}
      </div>
      {!terminal && (canAttend || (canManage && c.status !== 'in_progress')) && (
        <section className="tm-card end-consultation">
          <h2>{canAttend ? 'Encerramento e próximos passos' : 'Gerenciar consulta'}</h2>
          {canAttend && <p>Registre o desfecho para a clínica e o sistema de prontuário.</p>}
          <div className="button-row">
            {canAttend && (
              <>
                <button
                  className="tm-button outline"
                  disabled={busy}
                  onClick={() => setEnding(true)}
                >
                  Encerrar consulta
                </button>
                <Dialog open={ending} onOpenChange={setEnding}>
                  <DialogContent
                    className="telemed max-w-[calc(100vw-2rem)] sm:max-w-lg"
                    style={brandStyle(clinic)}
                  >
                    <DialogTitle>Encerrar atendimento</DialogTitle>
                    <DialogDescription className="my-4">
                      Selecione o desfecho. Ao confirmar, a sala será encerrada para você e o
                      paciente.
                    </DialogDescription>
                    {error && (
                      <p className="tm-error" role="alert">
                        {error}
                      </p>
                    )}
                    <label>
                      Desfecho
                      <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                        <option value="completed">Atendimento concluído</option>
                        <option value="referred_in_person">Encaminhar ao presencial</option>
                        <option value="no_show">Não compareceu</option>
                      </select>
                    </label>
                    {c.status !== 'in_progress' && outcome !== 'no_show' && (
                      <p className="muted mt-2">
                        Antes do atendimento, somente o desfecho “Não compareceu” está disponível.
                      </p>
                    )}
                    <div className="button-row">
                      <button
                        className="tm-button outline"
                        disabled={busy}
                        onClick={() => setEnding(false)}
                      >
                        Continuar atendimento
                      </button>
                      <button
                        className="tm-button"
                        disabled={busy || (c.status !== 'in_progress' && outcome !== 'no_show')}
                        onClick={() => void action('end', { outcome })}
                      >
                        Confirmar encerramento
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
            {canManage && c.status !== 'in_progress' && (
              <button
                className="tm-button subtle"
                disabled={busy}
                onClick={() => void action('cancel')}
              >
                Cancelar consulta
              </button>
            )}
          </div>
        </section>
      )}
    </ClinicLayout>
  )
}
