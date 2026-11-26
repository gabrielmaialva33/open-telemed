import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import VideoClosureService from '#modules/consultations/services/video_closure_service'

export default class CloseVideos extends BaseCommand {
  static commandName = 'telemed:close-videos'
  static description = 'Retry durable video closures after terminal consultation transitions'
  static options: CommandOptions = { startApp: true }

  async run() {
    const service = await this.app.container.make(VideoClosureService)
    const result = await service.retryPending()
    this.logger.info(`Video closures: ${result.completed}/${result.attempted} completed`)
    if (result.completed < result.attempted) this.exitCode = 1
  }
}
