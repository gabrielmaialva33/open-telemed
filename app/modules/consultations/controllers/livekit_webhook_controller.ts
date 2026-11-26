import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import VideoService from '#shared/services/video_service'
import LivekitWebhookService from '#modules/consultations/services/livekit_webhook_service'

@inject()
export default class LivekitWebhookController {
  constructor(
    private video: VideoService,
    private webhooks: LivekitWebhookService
  ) {}
  async handle({ request, response }: HttpContext) {
    let event
    try {
      event = await this.video.receiver.receive(
        request.raw() ?? '',
        request.header('authorization')
      )
    } catch {
      return response.unauthorized({ message: 'Assinatura inválida.' })
    }
    await this.webhooks.receive(event)
    return response.noContent()
  }
}
