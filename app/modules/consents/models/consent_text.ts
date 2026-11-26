import { DateTime } from 'luxon'
import { BaseModel, column, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'

export default class ConsentText extends BaseModel {
  static namingStrategy = new SnakeCaseNamingStrategy()
  static table = 'consent_texts'
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare tenant_id: number

  @column()
  declare version: number

  @column()
  declare body: string

  @column()
  declare hash: string

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime
}
