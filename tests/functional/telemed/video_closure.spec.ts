import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { ServerError, WebhookEvent } from 'livekit-server-sdk'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import Tenant from '#modules/tenants/models/tenant'
import User from '#modules/users/models/user'
import Professional from '#modules/professionals/models/professional'
import Consultation from '#modules/consultations/models/consultation'
import AuditLog from '#modules/audits/models/audit_log'
import ConsultationService from '#modules/consultations/services/consultation_service'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'
import ClinicalRecordService from '#modules/consultations/services/clinical_record_service'
import LivekitWebhookService from '#modules/consultations/services/livekit_webhook_service'
import VideoClosureService from '#modules/consultations/services/video_closure_service'
import VideoService from '#shared/services/video_service'

async function fixture() {
  const slug = `closure-${randomUUID()}`
  const tenant = await Tenant.create({ name: 'Synthetic clinic', slug, is_active: true })
  const user = await User.create({
    full_name: 'Synthetic doctor',
    email: `${slug}@example.test`,
    password: 'SyntheticPassword1!',
  })
  const professional = await Professional.create({
    tenant_id: tenant.id,
    user_id: user.id,
    crm: '998877',
    crm_uf: 'SP',
  })
  const consultation = await Consultation.create({
    tenant_id: tenant.id,
    professional_id: professional.id,
    patient_name: 'Synthetic patient',
    patient_location: 'São Paulo/SP',
    scheduled_at: DateTime.utc(),
    retain_until: DateTime.utc().plus({ years: 20 }),
    status: 'in_progress',
    admitted_at: DateTime.utc(),
    started_at: DateTime.utc(),
  })
  await db.transaction(async (trx) => {
    consultation.useTransaction(trx)
    await new ClinicalRecordService().capture(consultation, trx)
    await consultation.save()
  })
  return consultation
}
const row = (c: Consultation) =>
  db.from('video_closures').where('consultation_id', c.id).firstOrFail()

// Deliberately committed fixtures: the retry service must see closure rows across transactions.
test.group('Durable video closure', () => {
  test('finish commits clinical state and closure before provider failure; a new worker recovers', async ({
    assert,
  }) => {
    const c = await fixture()
    const video = new VideoService()
    let committedStatus: string | undefined
    let closureWasCommitted = false
    video.close = async () => {
      const persisted = await Consultation.findOrFail(c.id)
      committedStatus = persisted.status
      closureWasCommitted = Boolean(await row(c))
      throw new Error('SYNTHETIC_PROVIDER_SECRET should never be stored')
    }
    app.container.swap(VideoService, () => video)
    try {
      const service = await app.container.make(ConsultationService)
      await service.finish(c, 'ended', 'completed', c.professional_snapshot!.user_id)
    } finally {
      app.container.restore(VideoService)
    }
    assert.equal(committedStatus, 'ended')
    assert.isTrue(closureWasCommitted)
    const failed = await row(c)
    assert.isNull(failed.completed_at)
    assert.equal(failed.attempts, 1)
    assert.equal(failed.last_error, 'provider_close_failed')
    assert.notInclude(JSON.stringify(failed), 'SYNTHETIC_PROVIDER_SECRET')
    const recovery = new VideoService()
    recovery.close = async () => {}
    await new VideoClosureService(recovery).retryPending()
    const recovered = await row(c)
    assert.isNotNull(recovered.completed_at)
    assert.equal(recovered.attempts, 2)
    assert.isFalse(recovered.tokens_revoked)
    assert.isNull(recovered.last_error)
    assert.isFalse(await new VideoClosureService(recovery).attempt(c.tenant_id, c.id))
  })

  test('rollback cannot leave closure work for a non-terminal consultation', async ({ assert }) => {
    const c = await fixture()
    const closures = new VideoClosureService(new VideoService())
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          const locked = await Consultation.query({ client: trx })
            .where('id', c.id)
            .forUpdate()
            .firstOrFail()
          await locked.merge({ status: 'ended', outcome: 'completed' }).save()
          await closures.schedule(locked, trx)
          throw new Error('rollback sentinel')
        }),
      /rollback sentinel/
    )
    await c.refresh()
    assert.equal(c.status, 'in_progress')
    assert.isNull(await db.from('video_closures').where('consultation_id', c.id).first())
  })

  test('fresh workers recover a committed but unattempted closure and serialize provider work', async ({
    assert,
  }) => {
    const c = await fixture()
    const video = new VideoService()
    let calls = 0
    video.close = async () => {
      calls++
    }
    const initial = new VideoClosureService(video)
    await db.transaction(async (trx) => {
      const locked = await Consultation.query({ client: trx })
        .where('id', c.id)
        .forUpdate()
        .firstOrFail()
      await locked.merge({ status: 'ended', outcome: 'completed' }).save()
      await initial.schedule(locked, trx)
    })
    // Simulate process death before the first call, then two independent retry workers.
    const workers = [new VideoClosureService(video), new VideoClosureService(video)]
    const results = await Promise.all(workers.map((worker) => worker.attempt(c.tenant_id, c.id)))
    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(calls, 1)
    const complete = await row(c)
    assert.equal(complete.attempts, 1)
    assert.isNotNull(complete.completed_at)
  })

  test('Cloud revokes both known identities without listing participants and explicitly removes same-second tokens', async ({
    assert,
  }) => {
    const video = new VideoService()
    const calls: string[] = []
    video.rooms.listRooms = async () => {
      throw new Error('must not list rooms')
    }
    video.rooms.listParticipants = async () => {
      throw new Error('must not list participants')
    }
    video.rooms.removeParticipant = async (room, identity, options) => {
      calls.push(`${room}/${identity}`)
      assert.isDefined(options?.revokeTokenTs)
      assert.closeTo(Number(options!.revokeTokenTs), Math.floor(Date.now() / 1000) + 1, 1)
    }
    video.rooms.deleteRoom = async (room) => {
      calls.push(`delete:${room}`)
    }
    await video.close(4, 7, 'cloud')
    assert.deepEqual(calls, ['t4-7/doctor-7', 't4-7/patient-7', 'delete:t4-7'])
  })

  test('partial Cloud revocation and deletion failures remain pending until every step succeeds', async ({
    assert,
  }) => {
    const c = await fixture()
    await c.merge({ status: 'ended', outcome: 'completed' }).save()
    const previousMode = env.get('LIVEKIT_REVOCATION_MODE')
    env.set('LIVEKIT_REVOCATION_MODE', 'cloud')
    const video = new VideoService()
    const closures = new VideoClosureService(video)
    try {
      await db.transaction((trx) => closures.schedule(c, trx))
    } finally {
      env.set('LIVEKIT_REVOCATION_MODE', previousMode ?? 'self_hosted')
    }
    let failParticipant = true
    let failDelete = true
    let deletes = 0
    video.rooms.removeParticipant = async (_room, identity) => {
      if (identity.startsWith('patient') && failParticipant) throw new Error('provider unavailable')
    }
    video.rooms.deleteRoom = async () => {
      deletes++
      if (failDelete) throw new Error('provider unavailable')
    }
    assert.isFalse(await closures.attempt(c.tenant_id, c.id))
    assert.equal(deletes, 0)
    const partial = await row(c)
    assert.isNull(partial.completed_at)
    failParticipant = false
    assert.isFalse(await closures.attempt(c.tenant_id, c.id))
    const deletionFailed = await row(c)
    assert.isNull(deletionFailed.completed_at)
    failDelete = false
    assert.isTrue(await closures.attempt(c.tenant_id, c.id))
    const complete = await row(c)
    assert.equal(complete.attempts, 3)
    assert.isTrue(complete.tokens_revoked)
  })

  test('self-hosted deletion confirms disconnection but explicitly cannot claim token revocation', async ({
    assert,
  }) => {
    const video = new VideoService()
    video.rooms.removeParticipant = async () => {
      throw new Error('Cloud revocation unavailable')
    }
    video.rooms.deleteRoom = async () => {
      throw new ServerError('not_found', 'Room already gone', 404, 'not_found')
    }
    await assert.doesNotReject(() => video.close(4, 7, 'self_hosted'))
  })

  test('room_finished emits interruption without physician outcome; terminal late join retries without reopening', async ({
    assert,
  }) => {
    const c = await fixture()
    const tenant = await Tenant.findOrFail(c.tenant_id)
    await tenant
      .merge({
        webhook_url: 'https://example.test/events',
        webhook_secret: 'synthetic-webhook-secret-long-enough',
      })
      .save()
    const video = new VideoService()
    let closes = 0
    video.close = async () => {
      closes++
    }
    const closures = new VideoClosureService(video)
    const events = new ConsultationEventService()
    // Inspect durable event creation without delivering to an external destination.
    events.dispatchPending = async () => {}
    const hook = new LivekitWebhookService(events, closures)
    const finished = WebhookEvent.fromJson({
      id: randomUUID(),
      event: 'room_finished',
      room: { name: video.roomName(c.tenant_id, c.id) },
    })
    await hook.receive(finished)
    await hook.receive(finished)
    await c.refresh()
    assert.equal(c.status, 'in_progress')
    assert.isNull(c.outcome)
    assert.isNull(c.ended_at)
    const deliveries = await db.from('webhook_deliveries').where('consultation_id', c.id)
    assert.lengthOf(deliveries, 1)
    assert.equal(JSON.parse(deliveries[0].body).event, 'consultation.interrupted')
    assert.lengthOf(
      await AuditLog.query().where('resource_id', c.id).where('action', 'room_interrupted'),
      1
    )
    await db.transaction(async (trx) => {
      c.useTransaction(trx)
      await c.merge({ status: 'ended', outcome: 'completed', ended_at: DateTime.utc() }).save()
      await closures.schedule(c, trx)
    })
    await closures.attempt(c.tenant_id, c.id)
    const late = WebhookEvent.fromJson({
      id: randomUUID(),
      event: 'participant_joined',
      room: { name: video.roomName(c.tenant_id, c.id) },
      participant: { identity: `patient-${c.id}` },
    })
    await hook.receive(late)
    await hook.receive(late)
    await c.refresh()
    assert.equal(c.status, 'ended')
    assert.equal(c.outcome, 'completed')
    assert.equal(closes, 2)
    const retried = await row(c)
    assert.equal(retried.attempts, 2)
    assert.isNotNull(retried.completed_at)
  })
})
