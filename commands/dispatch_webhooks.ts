import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'

export default class DispatchWebhooks extends BaseCommand {
  static commandName = 'telemed:dispatch-webhooks'
  static description = 'Enqueue pending durable consultation webhooks'
  static options: CommandOptions = { startApp: true }
  async run() {
    await new ConsultationEventService().dispatchPending()
    this.logger.success('Webhooks pendentes enfileirados.')
  }
}
