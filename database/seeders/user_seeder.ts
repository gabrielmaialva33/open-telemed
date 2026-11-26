import { BaseSeeder } from '@adonisjs/lucid/seeders'

// The two-clinic demo is seeded together by TenantSeeder to preserve memberships.
export default class extends BaseSeeder {
  static environment = ['development']
  async run() {}
}
