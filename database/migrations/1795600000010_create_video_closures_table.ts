import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('video_closures', (table) => {
      table
        .integer('consultation_id')
        .unsigned()
        .primary()
        .references('id')
        .inTable('consultations')
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
      table.enum('mode', ['cloud', 'self_hosted']).notNullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.boolean('tokens_revoked').notNullable().defaultTo(false)
      table.string('last_error', 64).nullable()
      table.timestamp('attempted_at', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).nullable().index()
      table.timestamp('created_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable('video_closures')
  }
}
