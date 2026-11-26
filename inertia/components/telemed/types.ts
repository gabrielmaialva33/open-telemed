export type Clinic = {
  name: string
  slug: string
  logo_url: string | null
  primary_color: string | null
  accent_color: string | null
  legal_name: string | null
  cnpj: string | null
  crm_pj: string | null
  crm_pj_uf: string | null
  technical_director_name: string | null
  technical_director_crm: string | null
  technical_director_uf: string | null
}
export type Term = { version: number; hash: string; body: string }
export type Professional = {
  id: number
  user_id: number
  full_name: string
  crm: string
  crm_uf: string
  rqe: string | null
}
export type Consultation = {
  id: number
  patient_name: string
  patient_document?: string | null
  patient_location: string
  scheduled_at: string
  status: string
  outcome: string | null
  admitted_at?: string | null
  recording_allowed: boolean
  consent?: { version: number; text_hash: string; accepted_at: string } | null
  professional?: { name: string; crm: string; crm_uf: string }
}
export type VideoSession = { token: string; url: string }
export const statusLabels: Record<string, string> = {
  scheduled: 'Agendada',
  waiting: 'Paciente na espera',
  in_progress: 'Em atendimento',
  ended: 'Encerrada',
  cancelled: 'Cancelada',
}
export const outcomeLabels: Record<string, string> = {
  completed: 'Atendimento concluído',
  referred_in_person: 'Encaminhado ao presencial',
  patient_declined: 'Paciente optou pelo presencial',
  no_show: 'Não compareceu',
}
export const dateLabel = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })
