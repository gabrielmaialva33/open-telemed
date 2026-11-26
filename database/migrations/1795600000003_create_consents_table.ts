import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('consents', (table) => {
      table.increments('id')
      table
        .integer('consultation_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('consultations')
      table.integer('version').unsigned().notNullable()
      table.string('text_hash', 64).notNullable()
      table.timestamp('accepted_at', { useTz: true }).notNullable()
      table.string('ip', 64).notNullable()
      table.text('user_agent').notNullable()
      table.string('representative_name').nullable()
      table.string('representative_document', 32).nullable()
    })
    if (this.db.dialect.name === 'postgres') {
      this.schema.raw(
        `CREATE FUNCTION prevent_consents_mutation() RETURNS trigger AS $$ BEGIN  RAISE EXCEPTION 'consents records are immutable'; END; $$ LANGUAGE plpgsql`
      )
      this.schema.raw(
        `CREATE TRIGGER immutable_consents BEFORE UPDATE OR DELETE ON consents FOR EACH ROW EXECUTE FUNCTION prevent_consents_mutation()`
      )
    }
  }

  async down() {
    this.schema.dropTable('consents')
    if (this.db.dialect.name === 'postgres')
      this.schema.raw('DROP FUNCTION IF EXISTS prevent_consents_mutation()')
  }
}
