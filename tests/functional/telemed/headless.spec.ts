import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { createHash, generateKeyPairSync, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import User from '#modules/users/models/user'
import Tenant from '#modules/tenants/models/tenant'
import Professional from '#modules/professionals/models/professional'
import Consultation from '#modules/consultations/models/consultation'
import ConsentText from '#modules/consents/models/consent_text'
import PatientLink from '#modules/consultations/models/patient_link'
import Permission from '#modules/permissions/models/permission'
import Role from '#modules/roles/models/role'
import HeadlessConfigurationService from '#modules/headless/services/headless_configuration_service'

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const base = '/api/v1/headless'
async function fixture() {
  const slug = randomUUID()
  const tenant = await Tenant.create({ name: 'Clínica Fácil', slug, is_active: true })
  const doctor = await User.create({
    full_name: 'Ana Original',
    email: `${slug}@example.test`,
    password: 'password123',
  })
  const service = await User.create({
    full_name: 'Integration',
    email: `service-${slug}@example.test`,
    password: 'password123',
  })
  await doctor.related('tenants').attach({ [tenant.id]: { role: 'member' } })
  await service.related('tenants').attach({ [tenant.id]: { role: 'member' } })
  const role = await Role.findByOrFail('slug', 'doctor')
  await doctor.related('roles').attach([role.id])
  const abilities = [
    'consultations.headless_doctor',
    'consultations.headless_patient',
    'consultations.read',
    'consultations.link',
    'consultations.create',
  ]
  for (const name of abilities) {
    const [resource, action] = name.split('.')
    const permission = await Permission.firstOrCreate(
      { name },
      { name, resource, action, context: 'any' }
    )
    await service.related('permissions').attach({ [permission.id]: { granted: true } })
  }
  const token = await User.accessTokens.create(service, abilities)
  const professional = await Professional.create({
    tenant_id: tenant.id,
    user_id: doctor.id,
    crm: '123456',
    crm_uf: 'SP',
    rqe: '100',
  })
  const [connection] = await db
    .table('headless_connections')
    .insert({
      tenant_id: tenant.id,
      service_user_id: service.id,
      issuer: `clinic-${slug}`,
      public_key: publicKey,
      patient_url: 'https://clinic.example/teleconsulta',
      active: true,
    })
    .returning('id')
  await db.table('headless_identities').insert({
    connection_id: connection.id,
    subject: `doctor:${doctor.id}`,
    professional_id: professional.id,
  })
  const consultation = await Consultation.create({
    tenant_id: tenant.id,
    professional_id: professional.id,
    external_id: `appointment:${slug}`,
    patient_name: 'Paciente Exemplo',
    patient_location: 'São Paulo/SP',
    scheduled_at: DateTime.utc(),
    retain_until: DateTime.utc().plus({ years: 20 }),
  })
  const body = 'Autorizo esta teleconsulta.'
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
    expires_at: DateTime.utc().plus({ hours: 2 }),
  })
  const sign = (action: string, extra: Record<string, unknown> = {}) =>
    jwt.sign(
      {
        sub: `doctor:${doctor.id}`,
        consultation_id: consultation.id,
        action,
        jti: randomUUID(),
        ...extra,
      },
      keys.privateKey,
      {
        algorithm: 'RS256',
        issuer: `clinic-${slug}`,
        audience: 'telemed:doctor-action',
        expiresIn: 60,
      }
    )
  return {
    tenant,
    doctor,
    service,
    professional,
    consultation,
    term,
    secret,
    token: token.value!.release(),
    sign,
    connectionId: connection.id,
  }
}

test.group('Headless integration boundary', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('BFF patient and delegated doctor complete a consultation without a second login', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    f.tenant.webhook_url = 'https://clinic.example/events'
    f.tenant.webhook_secret = 'synthetic-webhook-secret'
    await f.tenant.save()
    const request = (path: string) =>
      client.post(`${base}${path}`).bearerToken(f.token).header('X-Tenant-Id', String(f.tenant.id))
    const exchange = await request('/patient/session').json({ secret: f.secret })
    exchange.assertStatus(200)
    exchange.assertAgainstApiSpec()
    assert.isString(exchange.body().session_secret)
    assert.notInclude(String(exchange.headers()['set-cookie'] ?? ''), 'telemed_patient_')
    const session = exchange.body().session_secret
    const patient = (action: string) =>
      request(`/patient/${action}?consultation_id=${f.consultation.id}`).header(
        'X-Patient-Session',
        session
      )
    const premature = await patient('video-token')
    premature.assertStatus(409)
    const consent = await patient('consent').json({
      accepted: true,
      version: 1,
      text_hash: f.term.hash,
      client_ip: '192.0.2.1',
      client_user_agent: 'Synthetic BFF',
    })
    consent.assertStatus(200)
    consent.assertAgainstApiSpec()
    const doctor = (action: string, extra: Record<string, unknown> = {}) =>
      request(`/doctor/${f.consultation.id}/${action}`).json({ assertion: f.sign(action, extra) })
    const admission = await doctor('admit')
    admission.assertStatus(200)
    admission.assertAgainstApiSpec()
    assert.equal(admission.body().data.professional_snapshot.name, 'Ana Original')
    const token = await doctor('video-token')
    token.assertStatus(200)
    token.assertAgainstApiSpec()
    assert.equal(
      (jwt.decode(token.body().token) as { metadata: string }).metadata,
      '{"role":"doctor"}'
    )
    const patientToken = await patient('video-token')
    patientToken.assertStatus(200)
    patientToken.assertAgainstApiSpec()
    await f.professional.merge({ crm: '999999', crm_uf: 'RJ' }).save()
    await f.doctor.merge({ full_name: 'Changed Name' }).save()
    const end = await doctor('end', { outcome: 'completed' })
    end.assertStatus(200)
    end.assertAgainstApiSpec()
    assert.equal(end.body().data.outcome_author.kind, 'doctor')
    assert.equal(end.body().data.outcome_author.external_subject, `doctor:${f.doctor.id}`)
    assert.equal(end.body().data.professional.crm, '123456')
    assert.equal(end.body().data.video_closure.status, 'completed')
    assert.isFalse(end.body().data.video_closure.tokens_revoked)
    const deliveries = await db
      .from('webhook_deliveries')
      .where('consultation_id', f.consultation.id)
      .orderBy('created_at')
    const events = deliveries.map((delivery) => JSON.parse(delivery.body))
    assert.deepEqual(
      events.map((event) => event.consultation.revision),
      [1, 2, 3]
    )
    assert.equal(events[2].consultation.professional.crm, '123456')
    assert.equal(events[2].consultation.outcome_author.kind, 'doctor')
    const afterEnd = await patient('video-token')
    afterEnd.assertStatus(409)
  })

  test('service credential alone, wrong subject, other consultation and changed action cannot attend', async ({
    client,
  }) => {
    const f = await fixture()
    for (const assertion of [
      undefined,
      f.sign('state', { sub: 'manager:99' }),
      f.sign('state', { consultation_id: f.consultation.id + 1 }),
      f.sign('admit'),
    ]) {
      const response = await client
        .post(`${base}/doctor/${f.consultation.id}/state`)
        .bearerToken(f.token)
        .header('X-Tenant-Id', String(f.tenant.id))
        .json({ assertion })
      response.assertStatus(assertion ? 403 : 422)
    }
  })

  test('expired, future, overlong, wrong-key and wrong-audience assertions are rejected', async ({
    client,
  }) => {
    const f = await fixture()
    const now = Math.floor(Date.now() / 1000)
    const claims = {
      sub: `doctor:${f.doctor.id}`,
      consultation_id: f.consultation.id,
      action: 'state',
      jti: randomUUID(),
      iat: now,
      exp: now + 60,
      iss: `clinic-${f.tenant.slug}`,
      aud: 'telemed:doctor-action',
    }
    const invalid = [
      jwt.sign({ ...claims, iat: now - 120, exp: now - 60 }, keys.privateKey, {
        algorithm: 'RS256',
      }),
      jwt.sign({ ...claims, iat: now + 30, exp: now + 60 }, keys.privateKey, {
        algorithm: 'RS256',
      }),
      jwt.sign({ ...claims, exp: now + 120 }, keys.privateKey, { algorithm: 'RS256' }),
      jwt.sign({ ...claims, aud: 'different' }, keys.privateKey, { algorithm: 'RS256' }),
      jwt.sign(claims, 'wrong-secret', { algorithm: 'HS256' }),
    ]
    for (const assertion of invalid) {
      const response = await client
        .post(`${base}/doctor/${f.consultation.id}/state`)
        .bearerToken(f.token)
        .header('X-Tenant-Id', String(f.tenant.id))
        .json({ assertion })
      response.assertStatus(401)
    }
  })

  test('assertion is single-use and mapped manager without doctor role is refused', async ({
    client,
  }) => {
    const f = await fixture()
    const assertion = f.sign('state')
    const call = (signed: string) =>
      client
        .post(`${base}/doctor/${f.consultation.id}/state`)
        .bearerToken(f.token)
        .header('X-Tenant-Id', String(f.tenant.id))
        .json({ assertion: signed })
    const first = await call(assertion)
    first.assertStatus(200)
    const replay = await call(assertion)
    replay.assertStatus(401)
    await f.doctor.related('roles').detach()
    const manager = await Role.findByOrFail('slug', 'clinic_owner')
    await f.doctor.related('roles').attach([manager.id])
    const impersonation = await call(f.sign('state'))
    impersonation.assertStatus(403)
  })

  test('foreign clinic credentials and foreign patient sessions cannot cross the boundary', async ({
    client,
  }) => {
    const a = await fixture()
    const b = await fixture()
    const foreign = await client
      .post(`${base}/doctor/${a.consultation.id}/state`)
      .bearerToken(b.token)
      .header('X-Tenant-Id', String(b.tenant.id))
      .json({ assertion: a.sign('state') })
    foreign.assertStatus(404)
    const exchange = await client
      .post(`${base}/patient/session`)
      .bearerToken(b.token)
      .header('X-Tenant-Id', String(b.tenant.id))
      .json({ secret: a.secret })
    exchange.assertStatus(404)
    const own = await client
      .post(`${base}/patient/session`)
      .bearerToken(a.token)
      .header('X-Tenant-Id', String(a.tenant.id))
      .json({ secret: a.secret })
    const state = await client
      .post(`${base}/patient/state?consultation_id=${a.consultation.id}`)
      .bearerToken(b.token)
      .header('X-Tenant-Id', String(b.tenant.id))
      .header('X-Patient-Session', own.body().session_secret)
    state.assertStatus(404)
  })

  test('headless clinics refuse legacy public patient exchange and panel attendance', async ({
    client,
  }) => {
    const f = await fixture()
    const legacy = await client
      .post(`/t/${f.tenant.slug}/patient/session`)
      .withCsrfToken()
      .json({ secret: f.secret })
    legacy.assertStatus(404)
    const panel = await client
      .get(`/consultations/${f.consultation.id}/room`)
      .loginAs(f.doctor)
      .header('X-Tenant-Id', String(f.tenant.id))
    panel.assertStatus(403)
  })

  test('another mapped doctor, revoked membership and missing headless ability are refused', async ({
    client,
  }) => {
    const f = await fixture()
    const other = await User.create({
      full_name: 'Other doctor',
      email: `${randomUUID()}@example.test`,
      password: 'password123',
    })
    await other.related('tenants').attach({ [f.tenant.id]: { role: 'member' } })
    const doctorRole = await Role.findByOrFail('slug', 'doctor')
    await other.related('roles').attach([doctorRole.id])
    const professional = await Professional.create({
      tenant_id: f.tenant.id,
      user_id: other.id,
      crm: '654321',
      crm_uf: 'SP',
    })
    await db.table('headless_identities').insert({
      connection_id: f.connectionId,
      professional_id: professional.id,
      subject: 'other-doctor',
    })
    const call = (assertion: string, token = f.token) =>
      client
        .post(`${base}/doctor/${f.consultation.id}/state`)
        .bearerToken(token)
        .header('X-Tenant-Id', String(f.tenant.id))
        .json({ assertion })
    const wrong = await call(f.sign('state', { sub: 'other-doctor' }))
    wrong.assertStatus(403)
    const readOnly = await User.accessTokens.create(f.service, ['consultations.read'])
    const ability = await call(f.sign('state'), readOnly.value!.release())
    ability.assertStatus(403)
    await f.doctor.related('tenants').detach([f.tenant.id])
    const revoked = await call(f.sign('state'))
    revoked.assertStatus(403)
    await db.from('headless_connections').where('id', f.connectionId).update({ active: false })
    const disabled = await call(f.sign('state'))
    disabled.assertStatus(403)
  })

  test('issuer changes cannot inherit old doctor subjects while same-issuer key rotation preserves mappings', async ({
    assert,
  }) => {
    const f = await fixture()
    const config = new HeadlessConfigurationService()
    const data = {
      tenantId: f.tenant.id,
      serviceUserId: f.service.id,
      issuer: `clinic-${f.tenant.slug}`,
      publicKey,
      patientUrl: 'https://clinic.example/teleconsulta',
    }
    await assert.rejects(
      () => config.configure({ ...data, issuer: 'different-issuer' }),
      /Remova os mapeamentos/
    )
    await config.configure(data)
    const mapping = await db
      .from('headless_identities')
      .where('connection_id', f.connectionId)
      .first()
    assert.equal(mapping.subject, `doctor:${f.doctor.id}`)
  })

  test('configured patient links use only the clinic frontend and no doctor login URL', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    const response = await client
      .post('/api/v1/consultations')
      .bearerToken(f.token)
      .header('X-Tenant-Id', String(f.tenant.id))
      .json({
        external_id: 'new',
        professional_id: f.professional.id,
        patient_name: 'Paciente Exemplo',
        patient_location: 'São Paulo/SP',
        scheduled_at: DateTime.utc().toISO(),
      })
    response.assertStatus(201)
    assert.match(response.body().patient_url, /^https:\/\/clinic\.example\/teleconsulta#[\w-]+$/)
    assert.isNull(response.body().doctor_url)
  })
})

test.group('Headless replay concurrency', () => {
  test('simultaneous reuse consumes exactly one assertion across HTTP requests', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    const signed = f.sign('state')
    const call = () =>
      client
        .post(`${base}/doctor/${f.consultation.id}/state`)
        .bearerToken(f.token)
        .header('X-Tenant-Id', String(f.tenant.id))
        .json({ assertion: signed })
    const responses = await Promise.all([call(), call()])
    assert.deepEqual(responses.map((r) => r.status()).sort(), [200, 401])
    const nonces = await db.from('headless_nonces').where('connection_id', f.connectionId)
    assert.lengthOf(nonces, 1)
  })
})
