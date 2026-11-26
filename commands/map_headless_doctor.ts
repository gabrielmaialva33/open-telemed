import { BaseCommand, flags } from '@adonisjs/core/ace'
import HeadlessConfigurationService from '#modules/headless/services/headless_configuration_service'
export default class extends BaseCommand {
  static commandName = 'telemed:map-doctor'
  static description = 'Map a verified external doctor subject (operator only)'
  static options = { startApp: true }
  @flags.number({ required: true }) declare tenantId: number
  @flags.number({ required: true }) declare professionalId: number
  @flags.string({ required: true }) declare subject: string
  async run() {
    await new HeadlessConfigurationService().mapDoctor({
      tenantId: this.tenantId,
      professionalId: this.professionalId,
      subject: this.subject,
    })
    this.logger.success('Doctor identity mapped')
  }
}
