import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class PatientLink extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()
  static table = 'patient_links'
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare consultation_id: number

  @column({ serializeAs: null })
  declare secret_hash: string

  @column({ serializeAs: null })
  declare session_hash: string | null

  @column.dateTime()
  declare expires_at: DateTime

  @column.dateTime()
  declare session_expires_at: DateTime | null

  @column()
  declare consent_version: number | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime
}
