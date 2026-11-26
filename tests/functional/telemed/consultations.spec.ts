import PatientService from '#modules/consultations/services/patient_service'
import ConsultationService from '#modules/consultations/services/consultation_service'
import AssignDefaultPermissionsService from '#modules/permissions/services/assign_default_permissions_service'
import Role from '#modules/roles/models/role'
import VideoService from '#shared/services/video_service'
import app from '@adonisjs/core/services/app'
import DeleteOwnAccountService from '#modules/users/services/delete_own_account_service'
import DeleteUserService from '#modules/users/services/delete_user_service'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { AccessToken } from 'livekit-server-sdk'
import db from '@adonisjs/lucid/services/db'
import AuditLog from '#modules/audits/models/audit_log'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'
import DeliverConsultationWebhook from '#modules/consultations/jobs/deliver_consultation_webhook'
import env from '#start/env'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import Tenant from '#modules/tenants/models/tenant'
import User from '#modules/users/models/user'
import Permission from '#modules/permissions/models/permission'
import Professional from '#modules/professionals/models/professional'
import Consultation from '#modules/consultations/models/consultation'
import ConsentText from '#modules/consents/models/consent_text'
import Consent from '#modules/consents/models/consent'
import PatientLink from '#modules/consultations/models/patient_link'

async function tokenFor(user: User, abilities: string[]) {
  const token = await User.accessTokens.create(user, abilities)
  return token.value!.release()
}
async function expectStatus(
  request: PromiseLike<{ assertStatus(status: number): void }>,
  status: number
) {
  const response = await request
  response.assertStatus(status)
}

async function fixture(slug: string, owner = false) {
  const tenant = await Tenant.create({
    name: slug,
    slug,
    is_active: true,
    custom_hosts: [`${slug}.test`],
  })
  const user = await User.create({
    full_name: 'Ana Teste',
    email: `${slug}@example.test`,
    password: 'password123',
  })
  await user.related('tenants').attach({ [tenant.id]: { role: owner ? 'owner' : 'member' } })
  const names = owner
    ? [
        'consultations.create',
        'consultations.update',
        'consultations.link',
        'professionals.read',
        'consultations.read',
        'consultations.cancel',
        'consultations.audit',
        'consultations.list',
        'consultations.attend.own',
        'consent_texts.create',
        'consent_texts.read',
        'professionals.create',
      ]
    : ['consultations.read.own', 'consultations.attend.own', 'consultations.list']
  for (const name of names) {
    const [resource, action, context = 'any'] = name.split('.')
    const p = await Permission.firstOrCreate({ name }, { name, resource, action, context })
    await user.related('permissions').attach({ [p.id]: { granted: true } })
  }
  const professional = await Professional.create({
    tenant_id: tenant.id,
    user_id: user.id,
    crm: '123456',
    crm_uf: 'SP',
  })
  const consultation = await Consultation.create({
    tenant_id: tenant.id,
    professional_id: professional.id,
    patient_name: 'Paciente Sintético',
    patient_location: 'São Paulo/SP',
    scheduled_at: DateTime.now(),
    retain_until: DateTime.now().plus({ years: 20 }),
  })
  const body = 'Autorizo a teleconsulta e a transmissão de imagens e dados.'
  const term = await ConsentText.create({
    tenant_id: tenant.id,
    version: 1,
    body,
    hash: createHash('sha256').update(body).digest('hex'),
  })
  const secret = randomUUID()
  await PatientLink.create({
    consultation_id: consultation.id,
    secret_hash: createHash('sha256').update(secret).digest('hex'),
    expires_at: DateTime.now().plus({ hours: 3 }),
  })
  return { tenant, user, professional, consultation, term, secret }
}

test.group('Telemed consultation isolation and consent', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('two consultations keep independent patient sessions and reject swapped cookies', async ({
    client,
    assert,
  }) => {
    const a = await fixture('parallel-a')
    const b = await fixture('parallel-b')
    const exchange = async (secret: string) =>
      client
        .post('/patient/session')
        .withCsrfToken()
        .header('accept', 'application/json')
        .json({ secret })
    const one = await exchange(a.secret)
    const two = await exchange(b.secret)
    const nameA = `telemed_patient_${a.consultation.id}`
    const nameB = `telemed_patient_${b.consultation.id}`
    assert.exists(one.cookie(nameA))
    assert.exists(two.cookie(nameB))
    for (const f of [a, b]) {
      const result = await client
        .get(`/patient/state?consultation_id=${f.consultation.id}`)
        .cookie(nameA, one.cookie(nameA)!.value)
        .cookie(nameB, two.cookie(nameB)!.value)
      result.assertStatus(200)
      assert.equal(result.body().consultation.id, f.consultation.id)
    }
    const swapped = await client
      .get(`/patient/state?consultation_id=${a.consultation.id}`)
      .cookie(nameA, two.cookie(nameB)!.value)
    swapped.assertStatus(401)
  })

  test('a clinical identity cannot be anonymized by self deletion or admin deletion', async ({
    assert,
  }) => {
    const f = await fixture('retained-doctor', true)
    const own = await app.container.make(DeleteOwnAccountService)
    await assert.rejects(
      () => own.run(f.user.id, { currentPassword: 'password123', confirmation: 'DELETE' }),
      /profissional/
    )
    const admin = await app.container.make(DeleteUserService)
    await assert.rejects(() => admin.run(f.user.id, f.user.id), /profissional/)
    await f.user.refresh()
    assert.isFalse(f.user.is_deleted)
    assert.equal(f.user.full_name, 'Ana Teste')
  })

  for (const action of ['consent', 'decline', 'video-token']) {
    test(`reissued link stops an already validated patient ${action} request`, async ({
      client,
      assert,
    }) => {
      const f = await fixture(`revoked-${action}`, true)
      const exchange = await client
        .post('/patient/session')
        .withCsrfToken()
        .json({ secret: f.secret })
      const cookieName = `telemed_patient_${f.consultation.id}`
      if (action === 'video-token') {
        await f.consultation.merge({ status: 'in_progress', admitted_at: DateTime.utc() }).save()
        await Consent.create({
          consultation_id: f.consultation.id,
          version: 1,
          text_hash: f.term.hash,
          accepted_at: DateTime.utc(),
          ip: '127.0.0.1',
          user_agent: 'test',
        })
      }
      const patient = await app.container.make(PatientService)
      const consultations = await app.container.make(ConsultationService)
      const session = patient.session.bind(patient)
      patient.session = async (ctx) => {
        const result = await session(ctx)
        await consultations.link(result.c) // deterministic concurrent reissue after initial authentication
        return result
      }
      app.container.swap(PatientService, () => patient)
      try {
        const response = await client
          .post(`/patient/${action}?consultation_id=${f.consultation.id}`)
          .cookie(cookieName, exchange.cookie(cookieName)!.value)
          .withCsrfToken()
          .json({ accepted: true, version: 1, text_hash: f.term.hash })
        response.assertStatus(401)
        await f.consultation.refresh()
        assert.equal(f.consultation.status, action === 'video-token' ? 'in_progress' : 'scheduled')
      } finally {
        app.container.restore(PatientService)
      }
    })
  }

  test('end rechecks assigned doctor after a concurrent reassignment', async ({
    client,
    assert,
  }) => {
    const f = await fixture('reassigned', true)
    const other = await fixture('replacement', true)
    const replacement = await Professional.create({
      tenant_id: f.tenant.id,
      user_id: other.user.id,
      crm: '876543',
      crm_uf: 'RN',
    })
    const consultations = await app.container.make(ConsultationService)
    const get = consultations.get.bind(consultations)
    consultations.get = async (ctx, action) => {
      const c = await get(ctx, action)
      await Consultation.query().where('id', c.id).update({ professional_id: replacement.id })
      return c
    }
    app.container.swap(ConsultationService, () => consultations)
    try {
      const result = await client
        .post(`/consultations/${f.consultation.id}/end`)
        .loginAs(f.user)
        .withCsrfToken()
        .json({ outcome: 'no_show' })
      result.assertStatus(403)
      await f.consultation.refresh()
      assert.equal(f.consultation.status, 'scheduled')
    } finally {
      app.container.restore(ConsultationService)
    }
  })

  test('permission sync repairs existing integrator grants without clinical attendance', async ({
    assert,
  }) => {
    const role = await Role.findByOrFail('slug', 'integrator')
    await role.related('permissions').detach()
    const sync = await app.container.make(AssignDefaultPermissionsService)
    await sync.run()
    const granted = await role.related('permissions').query()
    assert.includeMembers(
      granted.map((p) => p.name),
      ['consultations.update', 'consultations.link', 'professionals.read']
    )
    assert.notInclude(
      granted.map((p) => p.name),
      'consultations.attend.own'
    )
  })

  test('duplicate external identifiers never expose patient documents in database errors', async ({
    client,
    assert,
  }) => {
    const f = await fixture('privacy', true)
    await f.consultation.merge({ external_id: 'duplicate-privacy' }).save()
    const token = await User.accessTokens.create(f.user, ['consultations.create'])
    const response = await client
      .post('/api/v1/consultations')
      .bearerToken(token.value!.release())
      .json({
        professional_id: f.professional.id,
        external_id: 'duplicate-privacy',
        patient_name: 'Synthetic Privacy Patient',
        patient_document: 'SYNTHETIC-DOCUMENT-ONLY',
        patient_location: 'São Paulo/SP',
        scheduled_at: DateTime.utc().toISO(),
      })
    assert.notInclude(response.text(), 'SYNTHETIC-DOCUMENT-ONLY')
    response.assertStatus(200)
    assert.isNull(response.body().patient_url)
    assert.equal(response.body().consultation.id, f.consultation.id)
  })

  test('clinic admin can turn an existing member into a doctor who reads only their consultation', async ({
    client,
  }) => {
    const f = await fixture('professional', true)
    const member = await User.create({
      full_name: 'Médico Existente',
      email: 'existing@example.test',
      password: 'SyntheticPassword2026!',
    })
    await member.related('tenants').attach({ [f.tenant.id]: { role: 'member' } })
    const before = await client
      .get(`/consultations/${f.consultation.id}`)
      .loginAs(member)
      .header('accept', 'application/json')
    before.assertStatus(403)
    const response = await client
      .post('/professionals')
      .loginAs(f.user)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ user_id: member.id, crm: '987654', crm_uf: 'BA' })
    response.assertStatus(201)
    const own = await Consultation.create({
      tenant_id: f.tenant.id,
      professional_id: response.body().id,
      patient_name: 'Paciente Sintético',
      patient_location: 'Salvador/BA',
      scheduled_at: DateTime.utc(),
      retain_until: DateTime.utc().plus({ years: 20 }),
    })
    const read = await client
      .get(`/consultations/${own.id}`)
      .loginAs(member)
      .header('accept', 'application/json')
    read.assertStatus(200)
    const other = await client
      .get(`/consultations/${f.consultation.id}`)
      .loginAs(member)
      .header('accept', 'application/json')
    other.assertStatus(403)
  })

  test('tenant A cannot read, cancel or audit tenant B consultations', async ({
    client,
    assert,
  }) => {
    const a = await fixture('alpha', true)
    const b = await fixture('beta', true)
    const access = await User.accessTokens.create(a.user, [
      'consultations.read',
      'consultations.cancel',
      'consultations.audit',
    ])
    const token = access.value!.release()
    for (const suffix of ['', '/audit']) {
      const response = await client
        .get(`/api/v1/consultations/${b.consultation.id}${suffix}`)
        .bearerToken(token)
      response.assertStatus(404)
    }
    const cancelled = await client
      .post(`/api/v1/consultations/${b.consultation.id}/cancel`)
      .bearerToken(token)
    cancelled.assertStatus(404)
    const own = await client.get(`/api/v1/consultations/${a.consultation.id}`).bearerToken(token)
    assert.equal(own.status(), 200, JSON.stringify(own.body()))
  })

  test('patient video requires both explicit consent and doctor admission', async ({
    client,
    assert,
  }) => {
    const f = await fixture('alpha', true)
    const exchange = await client
      .post('/patient/session')
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ secret: f.secret })
    exchange.assertStatus(200)
    const cookie = exchange.cookie(`telemed_patient_${f.consultation.id}`)!.value
    const before = await client
      .post(`/patient/video-token?consultation_id=${f.consultation.id}`)
      .cookie(`telemed_patient_${f.consultation.id}`, cookie)
      .withCsrfToken()
      .header('accept', 'application/json')
    before.assertStatus(409)
    const unchecked = await client
      .post(`/patient/consent?consultation_id=${f.consultation.id}`)
      .cookie(`telemed_patient_${f.consultation.id}`, cookie)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ accepted: false, version: 1, text_hash: f.term.hash })
    unchecked.assertStatus(422)
    const consent = await client
      .post(`/patient/consent?consultation_id=${f.consultation.id}`)
      .cookie(`telemed_patient_${f.consultation.id}`, cookie)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ accepted: true, version: 1, text_hash: f.term.hash, recording_allowed: false })
    consent.assertStatus(200)
    const waiting = await client
      .post(`/patient/video-token?consultation_id=${f.consultation.id}`)
      .cookie(`telemed_patient_${f.consultation.id}`, cookie)
      .withCsrfToken()
      .header('accept', 'application/json')
    waiting.assertStatus(409)
    const admit = await client
      .post(`/consultations/${f.consultation.id}/admit`)
      .loginAs(f.user)
      .withCsrfToken()
      .header('accept', 'application/json')
    admit.assertStatus(200)
    const video = await client
      .post(`/patient/video-token?consultation_id=${f.consultation.id}`)
      .cookie(`telemed_patient_${f.consultation.id}`, cookie)
      .withCsrfToken()
      .header('accept', 'application/json')
    video.assertStatus(200)
    const payload = jwt.decode(video.body().token) as {
      video: { room: string; roomJoin: boolean }
      metadata: string
      name: string
    }
    assert.equal(payload.video.room, `t${f.tenant.id}-${f.consultation.id}`)
    assert.isTrue(payload.video.roomJoin)
    assert.deepEqual(JSON.parse(payload.metadata), { role: 'patient' })
    assert.equal(payload.name, 'Paciente')
    await f.consultation.refresh()
    assert.isFalse(f.consultation.recording_allowed)
  })

  test('doctor cannot admit or obtain video for another doctor in the same clinic', async ({
    client,
  }) => {
    const f = await fixture('alpha')
    const other = await User.create({
      full_name: 'Outro Médico',
      email: 'other@example.test',
      password: 'password123',
    })
    await other.related('tenants').attach({ [f.tenant.id]: { role: 'member' } })
    const p = await Professional.create({
      tenant_id: f.tenant.id,
      user_id: other.id,
      crm: '99999',
      crm_uf: 'SP',
    })
    f.consultation.professional_id = p.id
    await f.consultation.save()
    for (const action of ['admit', 'video-token']) {
      const response = await client
        .post(`/consultations/${f.consultation.id}/${action}`)
        .loginAs(f.user)
        .withCsrfToken()
        .header('accept', 'application/json')
      response.assertStatus(403)
    }
  })

  test('publishing a new term preserves the previously accepted version and hash', async ({
    client,
    assert,
  }) => {
    const f = await fixture('alpha', true)
    const exchange = await client
      .post('/patient/session')
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ secret: f.secret })
    const cookie = exchange.cookie(`telemed_patient_${f.consultation.id}`)!.value
    const accept = await client
      .post(`/patient/consent?consultation_id=${f.consultation.id}`)
      .cookie(`telemed_patient_${f.consultation.id}`, cookie)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ accepted: true, version: 1, text_hash: f.term.hash })
    accept.assertStatus(200)
    const publish = await client
      .post('/clinic/consent-texts')
      .loginAs(f.user)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ body: 'Nova versão do termo de teleconsulta para novos atendimentos.' })
    publish.assertStatus(201)
    const saved = await Consent.findByOrFail('consultation_id', f.consultation.id)
    assert.equal(saved.version, 1)
    assert.equal(saved.text_hash, f.term.hash)
    const terms = await ConsentText.query().where('tenant_id', f.tenant.id).orderBy('version')
    assert.lengthOf(terms, 2)
    assert.equal(terms[0].body, f.term.body)
    assert.equal(terms[1].version, 2)
  })

  test('unknown host is rejected and untrusted forwarded host cannot select a clinic', async ({
    client,
    assert,
  }) => {
    const f = await fixture('alpha')
    const unknown = await client.get('/c').header('host', 'unknown.test')
    unknown.assertStatus(404)
    const spoofed = await client
      .get('/c')
      .header('host', 'localhost')
      .header('x-forwarded-host', 'alpha.test')
    spoofed.assertStatus(200)
    assert.isNull(
      JSON.parse(
        spoofed
          .text()
          .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
      ).props.clinic
    )
    const custom = await client.get('/c').header('host', 'alpha.test')
    custom.assertStatus(200)
    assert.include(custom.text(), f.tenant.name)
  })

  test('public page never shares authenticated account, tenants, permissions or flash', async ({
    client,
    assert,
  }) => {
    const f = await fixture('alpha')
    const response = await client.get('/t/alpha/c').loginAs(f.user)
    response.assertStatus(200)
    const props = JSON.parse(
      response
        .text()
        .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
    ).props
    assert.notProperty(props, 'auth')
    assert.notProperty(props, 'flash')
    assert.notInclude(response.text(), f.user.email)
  })
  test('consent texts and accepted consents cannot be overwritten or deleted', async ({
    assert,
  }) => {
    const f = await fixture('alpha')
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          await trx.from('consent_texts').where('id', f.term.id).update({ body: 'changed' })
        }),
      /immutable/
    )
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          await trx.from('consent_texts').where('id', f.term.id).delete()
        }),
      /immutable/
    )
  })

  test('signed LiveKit events are idempotent and cannot reopen terminal consultations', async ({
    client,
    assert,
  }) => {
    const f = await fixture('alpha')
    f.consultation.merge({
      status: 'in_progress',
      admitted_at: DateTime.utc(),
      started_at: DateTime.utc(),
    })
    await f.consultation.save()
    async function send(event: string, id: string, identity?: string) {
      const body = JSON.stringify({
        id,
        event,
        createdAt: `${Math.floor(Date.now() / 1000)}`,
        room: { name: `t${f.tenant.id}-${f.consultation.id}` },
        ...(identity ? { participant: { identity } } : {}),
      })
      const token = new AccessToken(env.get('LIVEKIT_API_KEY'), env.get('LIVEKIT_API_SECRET'))
      token.sha256 = createHash('sha256').update(body).digest('base64')
      return client
        .post('/webhooks/livekit')
        .header('content-type', 'application/webhook+json')
        .header('authorization', await token.toJwt())
        .unsafeJson(body)
        .header('content-type', 'application/webhook+json')
    }
    for (const role of ['doctor', 'patient']) {
      const first = await send('participant_joined', `join-${role}`, `${role}-${f.consultation.id}`)
      first.assertStatus(204)
      const duplicate = await send(
        'participant_joined',
        `join-${role}`,
        `${role}-${f.consultation.id}`
      )
      duplicate.assertStatus(204)
    }
    const left = await send('participant_left', 'left', `patient-${f.consultation.id}`)
    left.assertStatus(204)
    await f.consultation.refresh()
    assert.isNotNull(f.consultation.patient_left_at)
    assert.equal(f.consultation.status, 'in_progress')
    const end = await send('room_finished', 'finished')
    end.assertStatus(204)
    await f.consultation.refresh()
    assert.equal(f.consultation.status, 'in_progress')
    assert.isNull(f.consultation.outcome)
    f.consultation.status = 'cancelled'
    f.consultation.ended_at = DateTime.utc()
    await f.consultation.save()
    await send('participant_joined', 'late-join', `patient-${f.consultation.id}`)
    await f.consultation.refresh()
    assert.equal(f.consultation.status, 'cancelled')
    assert.isNull(f.consultation.outcome)
    const joins = await AuditLog.query()
      .where('resource', 'consultations')
      .where('resource_id', f.consultation.id)
      .where('action', 'participant_joined')
    assert.lengthOf(joins, 2)
  })

  test('a valid signature for different payload bytes is rejected', async ({ client }) => {
    const token = new AccessToken(env.get('LIVEKIT_API_KEY'), env.get('LIVEKIT_API_SECRET'))
    token.sha256 = createHash('sha256').update('{}').digest('base64')
    const response = await client
      .post('/webhooks/livekit')
      .header('content-type', 'application/webhook+json')
      .header('authorization', await token.toJwt())
      .unsafeJson('{"event":"room_finished"}')
      .header('content-type', 'application/webhook+json')
    response.assertStatus(401)
  })

  test('expired links and sessions and wrong-clinic exchanges are denied', async ({ client }) => {
    const a = await fixture('alpha')
    await fixture('beta')
    const wrong = await client
      .post('/t/beta/patient/session')
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ secret: a.secret })
    wrong.assertStatus(404)
    const exchange = await client
      .post('/patient/session')
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ secret: a.secret })
    exchange.assertStatus(200)
    await PatientLink.query()
      .where('consultation_id', a.consultation.id)
      .update({ session_expires_at: DateTime.utc().minus({ minutes: 1 }).toSQL() })
    const stale = await client
      .get(`/patient/state?consultation_id=${a.consultation.id}`)
      .cookie(
        `telemed_patient_${a.consultation.id}`,
        exchange.cookie(`telemed_patient_${a.consultation.id}`)!.value
      )
      .header('accept', 'application/json')
    stale.assertStatus(401)
    await PatientLink.query()
      .where('consultation_id', a.consultation.id)
      .update({ expires_at: DateTime.utc().minus({ days: 1 }).toSQL() })
    const expired = await client
      .post('/patient/session')
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ secret: a.secret })
    expired.assertStatus(404)
    const noSession = await client
      .get(`/patient/state?consultation_id=${a.consultation.id}`)
      .header('accept', 'application/json')
    noSession.assertStatus(401)
  })

  test('idempotent creation keeps one consultation, one link and one scheduled audit', async ({
    client,
    assert,
  }) => {
    const f = await fixture('idempotent', true)
    const token = await tokenFor(f.user, ['consultations.create'])
    const payload = {
      professional_id: f.professional.id,
      external_id: 'appointment-42',
      patient_name: 'Synthetic Person',
      patient_location: 'Natal/RN',
      scheduled_at: '2026-12-01T10:00:00-03:00',
    }
    const first = await client.post('/api/v1/consultations').bearerToken(token).json(payload)
    first.assertStatus(201)
    first.assertAgainstApiSpec()
    const repeated = await client.post('/api/v1/consultations').bearerToken(token).json(payload)
    repeated.assertStatus(200)
    repeated.assertAgainstApiSpec()
    assert.equal(repeated.body().consultation.id, first.body().consultation.id)
    assert.isNull(repeated.body().patient_url)
    assert.lengthOf(
      await PatientLink.query().where('consultation_id', first.body().consultation.id),
      1
    )
    assert.lengthOf(
      await AuditLog.query()
        .where('resource', 'consultations')
        .where('resource_id', first.body().consultation.id)
        .where('action', 'scheduled'),
      1
    )
  })

  test('integration updates scheduled consultation and rejects updates after consent', async ({
    client,
    assert,
  }) => {
    const f = await fixture('reschedule', true)
    const other = await fixture('other-reschedule', true)
    const token = await tokenFor(f.user, ['consultations.update'])
    const update = (body: object) =>
      client.patch(`/api/v1/consultations/${f.consultation.id}`).bearerToken(token).json(body)
    await expectStatus(update({ professional_id: other.professional.id }), 404)
    await expectStatus(update({ scheduled_at: 'invalid' }), 422)
    await expectStatus(update({ scheduled_at: '2026-02-30T10:00:00Z' }), 422)
    await expectStatus(update({ scheduled_at: '2026-12-03T10:00:00-03:00' }), 200)
    await f.consultation.refresh()
    assert.equal(f.consultation.scheduled_at.toUTC().toISO(), '2026-12-03T13:00:00.000Z')
    await f.consultation.merge({ status: 'waiting' }).save()
    await expectStatus(update({ scheduled_at: '2026-12-04T10:00:00Z' }), 409)
    const foreign = await client
      .patch(`/api/v1/consultations/${other.consultation.id}`)
      .bearerToken(token)
      .json({ professional_id: f.professional.id })
    foreign.assertStatus(404)
  })

  test('explicit link issuance needs its own ability and invalidates old patient sessions', async ({
    client,
    assert,
  }) => {
    const f = await fixture('reissue', true)
    const read = await tokenFor(f.user, ['consultations.read'])
    const token = await tokenFor(f.user, ['consultations.link'])
    const route = `/api/v1/consultations/${f.consultation.id}/patient-link`
    await expectStatus(client.post(route).bearerToken(read), 403)
    const issued = await client.post(route).bearerToken(token)
    issued.assertStatus(200)
    issued.assertAgainstApiSpec()
    assert.include(issued.body().patient_url, '/c#')
    await expectStatus(
      client.post('/patient/session').withCsrfToken().json({ secret: f.secret }),
      404
    )
    await f.consultation.merge({ status: 'ended' }).save()
    await expectStatus(client.post(route).bearerToken(token), 409)
  })

  test('professional lookup requires read ability and scopes CRM to active clinic', async ({
    client,
    assert,
  }) => {
    const f = await fixture('lookup', true)
    await fixture('lookup-other', true)
    const token = await tokenFor(f.user, ['professionals.read'])
    const found = await client.get('/api/v1/professionals?crm=123456&crm_uf=SP').bearerToken(token)
    found.assertStatus(200)
    found.assertAgainstApiSpec()
    assert.deepEqual(
      found.body().data.map((p: { id: number }) => p.id),
      [f.professional.id]
    )
    await expectStatus(client.get('/api/v1/professionals?crm_uf=XX').bearerToken(token), 422)
    const denied = await tokenFor(f.user, ['consultations.read'])
    await expectStatus(client.get('/api/v1/professionals').bearerToken(denied), 403)
  })

  test('integration token creates a consultation with RAC fields but read-only token cannot cancel it', async ({
    client,
    assert,
  }) => {
    const f = await fixture('alpha', true)
    const token = await User.accessTokens.create(f.user, [
      'consultations.create',
      'consultations.read',
    ])
    const response = await client
      .post('/api/v1/consultations')
      .bearerToken(token.value!.release())
      .json({
        professional_id: f.professional.id,
        patient_name: 'Pessoa Sintética',
        patient_location: 'Salvador/BA',
        scheduled_at: '2026-12-01T10:00:00-03:00',
        external_id: 'external-123',
      })
    response.assertStatus(201)
    response.assertAgainstApiSpec()
    const body = response.body()
    assert.equal(body.consultation.modality, 'teleconsulta')
    assert.equal(body.consultation.external_id, 'external-123')
    assert.include(body.patient_url, '/c#')
    const saved = await PatientLink.findByOrFail('consultation_id', body.consultation.id)
    assert.notEqual(saved.secret_hash, body.patient_url.split('#')[1])
    const cancel = await client
      .post(`/api/v1/consultations/${body.consultation.id}/cancel`)
      .bearerToken(token.value!.release())
    cancel.assertStatus(403)
  })

  test('outgoing status webhook uses encrypted secret and a stable signed body on retry', async ({
    assert,
  }) => {
    const f = await fixture('alpha')
    const received: { body: string; signature: string | undefined; timestamp: string }[] = []
    const allowedOriginsBefore = env.get('WEBHOOK_ALLOWED_ORIGINS')
    const server = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      received.push({
        body,
        timestamp: String(req.headers['x-opentelemed-timestamp']),
        signature: req.headers['x-opentelemed-signature'] as string | undefined,
      })
      res.writeHead(received.length === 1 ? 503 : 204).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as AddressInfo).port
      f.tenant.merge({
        webhook_url: `http://127.0.0.1:${port}/event`,
        webhook_secret: 'synthetic-webhook-secret-with-32-characters',
      })
      await f.tenant.save()
      const stored = await db.from('tenants').where('id', f.tenant.id).firstOrFail()
      assert.notEqual(stored.webhook_secret, f.tenant.webhook_secret)
      assert.notProperty(f.tenant.serialize(), 'webhook_secret')
      const events = new ConsultationEventService()
      await f.consultation.refresh()
      await db.transaction((trx) => events.status(f.consultation, trx))
      const delivery = await db
        .from('webhook_deliveries')
        .where('tenant_id', f.tenant.id)
        .firstOrFail()
      const job = new DeliverConsultationWebhook()
      const previousOrigins = env.get('WEBHOOK_ALLOWED_ORIGINS')
      env.set('WEBHOOK_ALLOWED_ORIGINS', '')
      try {
        await assert.rejects(() => job.handle({ deliveryId: delivery.id }), /autorizado/)
        assert.lengthOf(received, 0)
      } finally {
        env.set('WEBHOOK_ALLOWED_ORIGINS', previousOrigins)
      }
      env.set('WEBHOOK_ALLOWED_ORIGINS', `http://127.0.0.1:${port}`)
      await assert.rejects(() => job.handle({ deliveryId: delivery.id }), /503/)
      await job.handle({ deliveryId: delivery.id })
      await job.handle({ deliveryId: delivery.id })
      assert.lengthOf(received, 2)
      assert.equal(received[0].body, received[1].body)
      assert.equal(
        received[1].signature,
        `sha256=${createHmac('sha256', f.tenant.webhook_secret!).update(`${received[1].timestamp}.${received[1].body}`).digest('hex')}`
      )
      const event = JSON.parse(received[1].body)
      assert.equal(event.event_id, delivery.id)
      assert.equal(event.consultation.professional.crm, '123456')
      assert.closeTo(Number(received[1].timestamp), Math.floor(Date.now() / 1000), 5)
      assert.notInclude(received[1].body, f.consultation.patient_name)
      const sent = await db.from('webhook_deliveries').where('id', delivery.id).firstOrFail()
      assert.equal(sent.attempts, 2)
      assert.isNotNull(sent.delivered_at)
    } finally {
      env.set('WEBHOOK_ALLOWED_ORIGINS', allowedOriginsBefore)
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
    }
  })
})

// Committed fixtures are required here: independent HTTP connections must contend on real locks.
test.group('Telemed concurrent integration', () => {
  test('simultaneous retries create exactly one consultation and link', async ({
    client,
    assert,
  }) => {
    const f = await fixture('concurrent-create', true)
    const token = await tokenFor(f.user, ['consultations.create'])
    const payload = {
      professional_id: f.professional.id,
      external_id: 'concurrent-42',
      patient_name: 'Synthetic Person',
      patient_location: 'Natal/RN',
      scheduled_at: '2026-12-01T10:00:00Z',
    }
    const responses = await Promise.all(
      [1, 2].map(() => client.post('/api/v1/consultations').bearerToken(token).json(payload))
    )
    assert.deepEqual(responses.map((r) => r.status()).sort(), [200, 201])
    assert.equal(responses[0].body().consultation.id, responses[1].body().consultation.id)
    assert.lengthOf(
      await PatientLink.query().where('consultation_id', responses[0].body().consultation.id),
      1
    )
  })

  test('video issuance refuses a terminal consultation even with a stale caller', async ({
    assert,
  }) => {
    const f = await fixture('closed-video', true)
    const video = new VideoService()
    await f.consultation.merge({ status: 'ended' }).save()
    await assert.rejects(
      () => video.token(f.tenant.id, f.consultation.id, 'patient', 'Synthetic'),
      /admitida/
    )
  })
})
