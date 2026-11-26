import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('professionals', (table) => {
      table.increments('id')
      table.integer('tenant_id').unsigned().notNullable().references('id').inTable('tenants')
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users')
      table.string('crm', 10).notNullable()
      table.string('crm_uf', 2).notNullable()
      table.string('rqe', 10).nullable()
      table.unique(['tenant_id', 'user_id'])
      table.unique(['tenant_id', 'crm', 'crm_uf'])
      table.unique(['tenant_id', 'id'])
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable('professionals')
  }
}
