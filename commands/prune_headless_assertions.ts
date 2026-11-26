import { BaseCommand } from '@adonisjs/core/ace'
import db from '@adonisjs/lucid/services/db'
export default class extends BaseCommand {
  static commandName = 'telemed:prune-assertions'
  static description = 'Remove expired assertion replay markers after a safety window'
  static options = { startApp: true }
  async run() {
    await db
      .from('headless_nonces')
      .where('expires_at', '<', new Date(Date.now() - 60000))
      .delete()
    this.logger.success('Expired assertion markers pruned')
  }
}
