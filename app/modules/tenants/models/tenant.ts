import { DateTime } from 'luxon'
import { BaseModel, column, manyToMany, SnakeCaseNamingStrategy } from '@adonisjs/lucid/orm'
import type { ManyToMany } from '@adonisjs/lucid/types/relations'
import encryption from '@adonisjs/core/services/encryption'
import User from '#modules/users/models/user'

export default class Tenant extends BaseModel {
  static table = 'tenants'
  static namingStrategy = new SnakeCaseNamingStrategy()

  /**
   * ------------------------------------------------------
   * Columns
   * ------------------------------------------------------
   */
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare is_active: boolean

  @column()
  declare logo_url: string | null

  @column()
  declare primary_color: string | null

  @column()
  declare accent_color: string | null

  @column()
  declare legal_name: string | null

  @column()
  declare cnpj: string | null

  @column()
  declare crm_pj: string | null

  @column()
  declare crm_pj_uf: string | null

  @column()
  declare technical_director_name: string | null

  @column()
  declare technical_director_crm: string | null

  @column()
  declare technical_director_uf: string | null

  @column()
  declare webhook_url: string | null

  @column({
    prepare: (value) => JSON.stringify(value),
    consume: (value) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare custom_hosts: string[]

  @column({
    serializeAs: null,
    prepare: (value) => (value ? encryption.encrypt(value) : null),
    consume: (value) => (value ? encryption.decrypt<string>(value) : null),
  })
  declare webhook_secret: string | null

  @column.dateTime({ autoCreate: true })
  declare created_at: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updated_at: DateTime

  /**
   * ------------------------------------------------------
   * Relationships
   * ------------------------------------------------------
   */
  @manyToMany(() => User, {
    pivotTable: 'user_tenants',
    pivotColumns: ['role'],
    pivotTimestamps: true,
  })
  declare users: ManyToMany<typeof User>
}
