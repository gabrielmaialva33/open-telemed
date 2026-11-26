import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('livekit_events', (table) => {
      table.string('id').primary()
      table
        .integer('consultation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('consultations')
      table.timestamp('created_at')
    })
  }

  async down() {
    this.schema.dropTable('livekit_events')
  }
}
