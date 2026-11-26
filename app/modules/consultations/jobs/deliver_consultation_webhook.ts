import { assertWebhookDestination } from '#modules/consultations/support/webhook_destination'
import { createHmac } from 'node:crypto'
import { Job } from '@rlanz/bull-queue'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'

export default class DeliverConsultationWebhook extends Job {
  static get $$filepath() {
    return import.meta.url
  }
  async handle({ deliveryId }: { deliveryId: string }) {
    const delivery = await db.from('webhook_deliveries').where('id', deliveryId).firstOrFail()
    if (delivery.delivered_at) return
    assertWebhookDestination(delivery.url)
    const secret = encryption.decrypt<string>(delivery.secret)
    if (!secret) throw new Error('Webhook secret unavailable')
    await db.from('webhook_deliveries').where('id', deliveryId).increment('attempts', 1)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${delivery.body}`)
      .digest('hex')
    const response = await fetch(delivery.url, {
      method: 'POST',
      body: delivery.body,
      headers: {
        'Content-Type': 'application/json',
        'X-OpenTelemed-Timestamp': timestamp,
        'X-OpenTelemed-Signature': `sha256=${signature}`,
      },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    })
    await response.body?.cancel()
    if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`)
    await db.from('webhook_deliveries').where('id', deliveryId).update({ delivered_at: new Date() })
  }

  async rescue({ deliveryId }: { deliveryId: string }) {
    this.logger.error(
      { event: 'webhook_delivery_exhausted', deliveryId },
      'Webhook sem confirmação após retentativas'
    )
  }
}
