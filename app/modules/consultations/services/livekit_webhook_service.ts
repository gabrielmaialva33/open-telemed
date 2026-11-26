import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { WebhookEvent } from 'livekit-server-sdk'
import Consultation from '#modules/consultations/models/consultation'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'

@inject()
export default class LivekitWebhookService {
  constructor(private events: ConsultationEventService) {}
  async receive(event: WebhookEvent) {
    if (
      !event.id ||
      !['participant_joined', 'participant_left', 'room_finished'].includes(event.event)
    )
      return
    const room = /^t(\d+)-(\d+)$/.exec(event.room?.name ?? '')
    if (!room) return
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
      // A delayed/replayed event cannot revive a finished consultation or bypass admission.
      if (c.status !== 'in_progress' || !c.admitted_at) return
      if (event.event === 'room_finished') {
        c.merge({
          status: 'ended',
          ended_at: DateTime.utc(),
          outcome: c.doctor_joined_at && c.patient_joined_at ? 'completed' : 'no_show',
        })
        await c.save()
        await this.events.status(c, trx)
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
    await this.events.dispatchPending()
  }
}
