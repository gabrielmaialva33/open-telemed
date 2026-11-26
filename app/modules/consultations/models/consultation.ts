import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export type ProfessionalSnapshot = {
  professional_id: number
  user_id: number
  name: string
  crm: string
  crm_uf: string
  rqe: string | null
  captured_at: string
  capture_reason: 'admission' | 'no_show'
}

export type OutcomeAuthor = {
  kind: 'doctor' | 'patient' | 'system'
  user_id: number | null
  external_subject: string | null
  consultation_id: number
  attributed_at: string
  professional: ProfessionalSnapshot | null
}

export default class Consultation extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()
  static table = 'consultations'
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare tenant_id: number

  @column()
  declare professional_id: number

  @column()
  declare external_id: string | null

  @column()
  declare revision: number

  @column()
  declare patient_name: string

  @column()
  declare patient_document: string | null

  @column()
  declare patient_location: string

  @column()
  declare status: 'scheduled' | 'waiting' | 'in_progress' | 'ended' | 'cancelled'

  @column()
  declare outcome: 'completed' | 'referred_in_person' | 'patient_declined' | 'no_show' | null

  @column({
    prepare: (value) => (value === null || value === undefined ? null : JSON.stringify(value)),
    consume: (value) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare professional_snapshot: ProfessionalSnapshot | null

  @column({
    prepare: (value) => (value === null || value === undefined ? null : JSON.stringify(value)),
    consume: (value) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare outcome_author: OutcomeAuthor | null

  @column()
  declare recording_allowed: boolean

  @column.dateTime()
  declare scheduled_at: DateTime

  @column.dateTime()
  declare admitted_at: DateTime | null

  @column.dateTime()
  declare started_at: DateTime | null

  @column.dateTime()
  declare ended_at: DateTime | null

  @column.dateTime()
  declare doctor_joined_at: DateTime | null

  @column.dateTime()
  declare patient_joined_at: DateTime | null

  @column.dateTime()
  declare doctor_left_at: DateTime | null

  @column.dateTime()
  declare patient_left_at: DateTime | null

  @column.dateTime()
  declare retain_until: DateTime

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime
  toRecord() {
    return {
      id: this.id,
      tenant_id: this.tenant_id,
      professional_id: this.professional_id,
      external_id: this.external_id,
      revision: this.revision,
      patient_name: this.patient_name,
      patient_document: this.patient_document,
      patient_location: this.patient_location,
      status: this.status,
      outcome: this.outcome,
      professional_snapshot: this.professional_snapshot ?? null,
      outcome_author: this.outcome_author ?? null,
      recording_allowed: this.recording_allowed,
      scheduled_at: this.scheduled_at?.toISO() ?? null,
      admitted_at: this.admitted_at?.toISO() ?? null,
      started_at: this.started_at?.toISO() ?? null,
      ended_at: this.ended_at?.toISO() ?? null,
      doctor_joined_at: this.doctor_joined_at?.toISO() ?? null,
      patient_joined_at: this.patient_joined_at?.toISO() ?? null,
      doctor_left_at: this.doctor_left_at?.toISO() ?? null,
      patient_left_at: this.patient_left_at?.toISO() ?? null,
      retain_until: this.retain_until?.toISO() ?? null,
      created_at: this.created_at?.toISO() ?? null,
      updated_at: this.updated_at?.toISO() ?? null,
    }
  }
}
