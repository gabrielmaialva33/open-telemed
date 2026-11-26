import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('patient_links', (table) => {
      table.increments('id')
      table
        .integer('consultation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('consultations')
      table.string('secret_hash', 64).notNullable().unique()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.integer('consent_version').nullable()
      table.string('session_hash', 64).nullable().unique()
      table.timestamp('session_expires_at', { useTz: true }).nullable()
      table.timestamp('created_at')
    })
  }

  async down() {
    this.schema.dropTable('patient_links')
  }
}
