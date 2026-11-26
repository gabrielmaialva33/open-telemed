import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('consent_texts', (table) => {
      table.increments('id')
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
      table.integer('version').unsigned().notNullable()
      table.text('body').notNullable()
      table.string('hash', 64).notNullable()
      table.unique(['tenant_id', 'version'])
      table.timestamp('created_at')
    })
    if (this.db.dialect.name === 'postgres') {
      this.schema.raw(
        `CREATE FUNCTION prevent_consent_texts_mutation() RETURNS trigger AS $$ BEGIN  RAISE EXCEPTION 'consent_texts records are immutable'; END; $$ LANGUAGE plpgsql`
      )
      this.schema.raw(
        `CREATE TRIGGER immutable_consent_texts BEFORE UPDATE OR DELETE ON consent_texts FOR EACH ROW EXECUTE FUNCTION prevent_consent_texts_mutation()`
      )
    }
  }

  async down() {
    this.schema.dropTable('consent_texts')
    if (this.db.dialect.name === 'postgres')
      this.schema.raw('DROP FUNCTION IF EXISTS prevent_consent_texts_mutation()')
  }
}
