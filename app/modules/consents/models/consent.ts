import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class Consent extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()
  static table = 'consents'
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare consultation_id: number

  @column()
  declare version: number

  @column()
  declare text_hash: string

  @column()
  declare ip: string

  @column()
  declare user_agent: string

  @column()
  declare representative_name: string | null

  @column()
  declare representative_document: string | null

  @column.dateTime()
  declare accepted_at: DateTime
}
