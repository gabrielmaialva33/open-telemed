import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('headless_connections', (table) => {
      table.increments('id')
      table.integer('tenant_id').notNullable().unique().references('id').inTable('tenants')
      table.integer('service_user_id').notNullable().unique().references('id').inTable('users')
      table.string('issuer', 200).notNullable()
      table.text('public_key').notNullable()
      table.string('patient_url', 500).notNullable()
      table.boolean('active').notNullable().defaultTo(true)
    })
    this.schema.createTable('headless_identities', (table) => {
      table.increments('id')
      table.integer('connection_id').notNullable().references('id').inTable('headless_connections')
      table.string('subject', 128).notNullable()
      table.integer('professional_id').notNullable().references('id').inTable('professionals')
      table.unique(['connection_id', 'subject'])
      table.unique(['connection_id', 'professional_id'])
    })
    this.schema.createTable('headless_nonces', (table) => {
      table.integer('connection_id').notNullable().references('id').inTable('headless_connections')
      table.uuid('nonce').notNullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.primary(['connection_id', 'nonce'])
      table.index('expires_at')
    })
  }
  async down() {
    this.schema.dropTable('headless_nonces')
    this.schema.dropTable('headless_identities')
    this.schema.dropTable('headless_connections')
  }
}
