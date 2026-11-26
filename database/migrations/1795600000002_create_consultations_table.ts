import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('consultations', (table) => {
      table.increments('id')
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
      table.integer('professional_id').unsigned().notNullable()
      table
        .foreign(['tenant_id', 'professional_id'])
        .references(['tenant_id', 'id'])
        .inTable('professionals')
      table.string('external_id', 128).nullable()
      table.unique(['tenant_id', 'external_id'])
      table.string('patient_name').notNullable()
      table.string('patient_document', 32).nullable()
      table.string('patient_location').notNullable()
      table
        .enum('status', ['scheduled', 'waiting', 'in_progress', 'ended', 'cancelled'])
        .notNullable()
        .defaultTo('scheduled')
      table
        .enum('outcome', ['completed', 'referred_in_person', 'patient_declined', 'no_show'])
        .nullable()
      table.boolean('recording_allowed').notNullable().defaultTo(false)
      table.timestamp('scheduled_at', { useTz: true }).notNullable()
      table.timestamp('admitted_at', { useTz: true }).nullable()
      table.timestamp('started_at', { useTz: true }).nullable()
      table.timestamp('ended_at', { useTz: true }).nullable()
      table.timestamp('doctor_joined_at', { useTz: true }).nullable()
      table.timestamp('patient_joined_at', { useTz: true }).nullable()
      table.timestamp('doctor_left_at', { useTz: true }).nullable()
      table.timestamp('patient_left_at', { useTz: true }).nullable()
      table.timestamp('retain_until', { useTz: true }).notNullable()
      table.timestamp('created_at')
      table.timestamp('updated_at')
      table.index(['tenant_id', 'status'])
    })
  }

  async down() {
    this.schema.dropTable('consultations')
  }
}
