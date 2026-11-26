import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Consultation from '#modules/consultations/models/consultation'
import VideoService from '#shared/services/video_service'
import env from '#start/env'

@inject()
export default class VideoClosureService {
  constructor(private video: VideoService) {}

  /** Caller must hold the consultation lock; enqueue in the clinical transaction. */
  async schedule(c: Consultation, trx: TransactionClientContract) {
    if (!['ended', 'cancelled'].includes(c.status)) throw new Error('Consultation is not terminal')
    await trx
      .table('video_closures')
      .insert({
        consultation_id: c.id,
        tenant_id: c.tenant_id,
        mode: env.get('LIVEKIT_REVOCATION_MODE', 'self_hosted'),
        created_at: new Date(),
      })
      .onConflict('consultation_id')
      .merge({ completed_at: null, tokens_revoked: false })
  }

  async attempt(tenantId: number, consultationId: number) {
    return db.transaction(async (trx) => {
      // Same lock order as finish/webhooks. A late join cannot be lost while completing
      // a previous attempt, and concurrent retry workers cannot process the same row.
      const c = await Consultation.query({ client: trx })
        .where('tenant_id', tenantId)
        .where('id', consultationId)
        .forUpdate()
        .firstOrFail()
      const closure = await trx
        .from('video_closures')
        .where('tenant_id', tenantId)
        .where('consultation_id', consultationId)
        .forUpdate()
        .first()
      if (!closure || closure.completed_at || !['ended', 'cancelled'].includes(c.status))
        return false
      const query = () =>
        trx
          .from('video_closures')
          .where('tenant_id', tenantId)
          .where('consultation_id', consultationId)
      await query().update({ attempts: closure.attempts + 1, attempted_at: new Date() })
      try {
        await this.video.close(tenantId, consultationId, closure.mode)
        await query().update({
          completed_at: new Date(),
          tokens_revoked: closure.mode === 'cloud',
          last_error: null,
        })
        return true
      } catch {
        // Provider messages can contain URLs, tokens or participant information.
        await query().update({ last_error: 'provider_close_failed' })
        logger.warn({ event: 'video_close_failed', consultationId }, 'Video closure pending retry')
        return false
      }
    })
  }

  async retryPending() {
    const pending = await db
      .from('video_closures')
      .whereNull('completed_at')
      .orderByRaw('COALESCE(attempted_at, created_at) asc')
      .limit(100)
    let completed = 0
    for (const closure of pending) {
      if (await this.attempt(closure.tenant_id, closure.consultation_id)) completed++
    }
    return { attempted: pending.length, completed }
  }
}
