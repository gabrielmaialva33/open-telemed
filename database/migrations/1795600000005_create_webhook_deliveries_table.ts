import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('webhook_deliveries', (table) => {
      table.uuid('id').primary()
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
      table
        .integer('consultation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('consultations')
      table.string('url', 2048).notNullable()
      table.text('secret').notNullable()
      table.text('body').notNullable()
      table.timestamp('delivered_at', { useTz: true }).nullable()
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('created_at')
    })
  }

  async down() {
    this.schema.dropTable('webhook_deliveries')
  }
}
