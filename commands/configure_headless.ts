import { BaseCommand, flags } from '@adonisjs/core/ace'
import { readFile } from 'node:fs/promises'
import HeadlessConfigurationService from '#modules/headless/services/headless_configuration_service'
export default class extends BaseCommand {
  static commandName = 'telemed:configure-headless'
  static description = 'Configure a trusted clinic backend (operator only)'
  static options = { startApp: true }
  @flags.number({ required: true }) declare tenantId: number
  @flags.number({ required: true }) declare serviceUserId: number
  @flags.string({ required: true }) declare issuer: string
  @flags.string({ required: true }) declare publicKeyFile: string
  @flags.string({ required: true }) declare patientUrl: string
  async run() {
    await new HeadlessConfigurationService().configure({
      tenantId: this.tenantId,
      serviceUserId: this.serviceUserId,
      issuer: this.issuer,
      patientUrl: this.patientUrl,
      publicKey: await readFile(this.publicKeyFile, 'utf8'),
    })
    this.logger.success('Headless connection configured')
  }
}
