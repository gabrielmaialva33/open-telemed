import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { WebhookEvent } from 'livekit-server-sdk'
import Consultation from '#modules/consultations/models/consultation'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'
import VideoClosureService from '#modules/consultations/services/video_closure_service'

@inject()
export default class LivekitWebhookService {
  constructor(
    private events: ConsultationEventService,
    private closures: VideoClosureService
  ) {}
  async receive(event: WebhookEvent) {
    if (
      !event.id ||
      !['participant_joined', 'participant_left', 'room_finished'].includes(event.event)
    )
      return
    const room = /^t(\d+)-(\d+)$/.exec(event.room?.name ?? '')
    if (!room) return
    let retryClosure = false
    await db.transaction(async (trx) => {
      const c = await Consultation.query({ client: trx })
        .where('tenant_id', Number(room[1]))
        .where('id', Number(room[2]))
        .forUpdate()
        .first()
      if (!c || (await trx.from('livekit_events').where('id', event.id).first())) return
      await trx
        .table('livekit_events')
        .insert({ id: event.id, consultation_id: c.id, created_at: new Date() })
      if (['ended', 'cancelled'].includes(c.status) && event.event === 'participant_joined') {
        await this.closures.schedule(c, trx)
        await this.events.audit(c, 'video_terminal_join', trx)
        retryClosure = true
        return
      }
      // A delayed/replayed event cannot revive a finished consultation or bypass admission.
      if (c.status !== 'in_progress' || !c.admitted_at) return
      if (event.event === 'room_finished') {
        // Room lifecycle is operational evidence, never a physician's clinical outcome.
        await this.events.audit(c, 'room_interrupted', trx)
        await this.events.status(c, trx, undefined, 'consultation.interrupted')
        return
      }
      const identity = event.participant?.identity
      const role =
        identity === `doctor-${c.id}` ? 'doctor' : identity === `patient-${c.id}` ? 'patient' : null
      if (!role) return
      const at = event.createdAt ? DateTime.fromSeconds(Number(event.createdAt)) : DateTime.utc()
      const field = `${role}_${event.event === 'participant_joined' ? 'joined' : 'left'}_at` as
        'doctor_joined_at' | 'patient_joined_at' | 'doctor_left_at' | 'patient_left_at'
      if (!c[field] || c[field]! < at) c[field] = at
      await c.save()
      await this.events.audit(c, event.event, trx, undefined, { role })
    })
    if (retryClosure) await this.closures.attempt(Number(room[1]), Number(room[2]))
    await this.events.dispatchPending()
  }
}
