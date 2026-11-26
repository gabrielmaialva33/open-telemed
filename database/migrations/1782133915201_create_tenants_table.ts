import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tenants'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name').notNullable()
      table.string('slug').notNullable().unique()
      table.string('logo_url', 2048).nullable()
      table.string('primary_color', 7).notNullable().defaultTo('#0f766e')
      table.string('accent_color', 7).notNullable().defaultTo('#d1fae5')
      table.jsonb('custom_hosts').notNullable().defaultTo('[]')
      table.string('legal_name').nullable()
      table.string('cnpj', 18).nullable()
      table.string('crm_pj', 20).nullable()
      table.string('crm_pj_uf', 2).nullable()
      table.string('technical_director_name').nullable()
      table.string('technical_director_crm', 20).nullable()
      table.string('technical_director_uf', 2).nullable()
      table.string('webhook_url', 2048).nullable()
      table.text('webhook_secret').nullable()
      table.boolean('is_active').notNullable().defaultTo(true)

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
