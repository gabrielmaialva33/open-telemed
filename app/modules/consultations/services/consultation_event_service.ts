import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import encryption from '@adonisjs/core/services/encryption'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import queue from '@rlanz/bull-queue/services/main'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import AuditLog from '#modules/audits/models/audit_log'
import type Consultation from '#modules/consultations/models/consultation'
import Professional from '#modules/professionals/models/professional'
import Tenant from '#modules/tenants/models/tenant'
import DeliverConsultationWebhook from '#modules/consultations/jobs/deliver_consultation_webhook'

export default class ConsultationEventService {
  async audit(
    c: Consultation,
    action: string,
    trx: TransactionClientContract,
    userId?: number,
    metadata: Record<string, unknown> = {}
  ) {
    await AuditLog.create(
      {
        user_id: userId ?? null,
        resource: 'consultations',
        resource_id: c.id,
        action,
        result: 'granted',
        metadata: { tenant_id: c.tenant_id, ...metadata },
      },
      { client: trx }
    )
  }

  async status(
    c: Consultation,
    trx: TransactionClientContract,
    userId?: number,
    event = 'consultation.status_changed'
  ) {
    await this.audit(c, event === 'consultation.updated' ? 'updated' : c.status, trx, userId, {
      status: c.status,
      outcome: c.outcome,
    })
    if (c.outcome) await this.audit(c, 'outcome', trx, userId, { outcome: c.outcome })
    const tenant = await Tenant.findOrFail(c.tenant_id, { client: trx })
    if (!tenant.webhook_url || !tenant.webhook_secret) return
    const professional = await Professional.query({ client: trx })
      .where('tenant_id', c.tenant_id)
      .where('id', c.professional_id)
      .firstOrFail()
    const id = randomUUID()
    const body = JSON.stringify({
      id,
      event_id: id,
      event,
      occurred_at: DateTime.utc().toISO(),
      tenant_id: c.tenant_id,
      consultation: {
        id: c.id,
        external_id: c.external_id,
        status: c.status,
        outcome: c.outcome,
        modality: 'teleconsulta',
        professional: { id: professional.id, crm: professional.crm, crm_uf: professional.crm_uf },
        admitted_at: c.admitted_at?.toISO() ?? null,
        scheduled_at: c.scheduled_at.toISO(),
        started_at: c.started_at?.toISO() ?? null,
        ended_at: c.ended_at?.toISO() ?? null,
      },
    })
    await trx.table('webhook_deliveries').insert({
      id,
      tenant_id: c.tenant_id,
      consultation_id: c.id,
      url: tenant.webhook_url,
      secret: encryption.encrypt(tenant.webhook_secret),
      body,
      created_at: new Date(),
    })
  }

  async dispatchPending() {
    const pending = await db
      .from('webhook_deliveries')
      .whereNull('delivered_at')
      .orderBy('created_at')
      .limit(100)
    for (const delivery of pending) {
      try {
        await queue.dispatch(
          DeliverConsultationWebhook,
          { deliveryId: delivery.id },
          {
            jobId: delivery.id,
            attempts: 6,
            backoff: { type: 'exponential', delay: 1000 },
            queueName: 'consultation-webhooks',
          }
        )
      } catch {
        // The durable outbox can be replayed with telemed:dispatch-webhooks.
        logger.error(
          { event: 'webhook_enqueue_failed', deliveryId: delivery.id },
          'Falha ao enfileirar webhook'
        )
      }
    }
  }
}
