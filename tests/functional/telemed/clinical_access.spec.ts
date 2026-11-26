import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import app from '@adonisjs/core/services/app'
import CreateDefaultPermissionsService from '#modules/permissions/services/create_default_permissions_service'
import { DateTime } from 'luxon'
import jwt from 'jsonwebtoken'
import User from '#modules/users/models/user'
import Role from '#modules/roles/models/role'
import Permission from '#modules/permissions/models/permission'
import Tenant from '#modules/tenants/models/tenant'
import Professional from '#modules/professionals/models/professional'
import Consultation from '#modules/consultations/models/consultation'
import Consent from '#modules/consents/models/consent'
import VideoService from '#shared/services/video_service'

async function fixture(actorRole: string, assigned = false) {
  const tenant = await Tenant.create({
    name: 'Synthetic clinic',
    slug: 'clinical-access',
    is_active: true,
    custom_hosts: [],
  })
  const doctor = await User.create({
    full_name: 'Assigned Doctor',
    email: 'assigned@example.test',
    password: 'SyntheticPassword2026!',
  })
  const actor = await User.create({
    full_name: 'Clinic Actor',
    email: 'actor@example.test',
    password: 'SyntheticPassword2026!',
  })
  for (const [user, slug, membership] of [
    [doctor, 'doctor', 'member'],
    [
      actor,
      actorRole,
      actorRole === 'clinic_owner' ? 'owner' : actorRole === 'doctor' ? 'member' : 'admin',
    ],
  ] as const) {
    await user.related('tenants').attach({ [tenant.id]: { role: membership } })
    const role = await Role.findByOrFail('slug', slug)
    await user.related('roles').attach([role.id])
  }
  const professional = await Professional.create({
    tenant_id: tenant.id,
    user_id: assigned ? actor.id : doctor.id,
    crm: '123456',
    crm_uf: 'SP',
  })
  if (actorRole === 'doctor' && !assigned) {
    const other = await Professional.create({
      tenant_id: tenant.id,
      user_id: actor.id,
      crm: '654321',
      crm_uf: 'SP',
    })
    await Consultation.create({
      tenant_id: tenant.id,
      professional_id: other.id,
      patient_name: 'Another Synthetic Patient',
      patient_location: 'São Paulo/SP',
      scheduled_at: DateTime.utc(),
      retain_until: DateTime.utc().plus({ years: 20 }),
    })
  }
  const consultation = await Consultation.create({
    tenant_id: tenant.id,
    professional_id: professional.id,
    patient_name: 'Synthetic Patient',
    patient_location: 'São Paulo/SP',
    scheduled_at: DateTime.utc(),
    retain_until: DateTime.utc().plus({ years: 20 }),
    status: 'waiting',
  })
  await Consent.create({
    consultation_id: consultation.id,
    version: 1,
    text_hash: 'a'.repeat(64),
    accepted_at: DateTime.utc(),
    ip: '127.0.0.1',
    user_agent: 'synthetic-test',
  })
  return { tenant, actor, doctor, consultation }
}

test.group('Clinical attendance is exclusive to the assigned professional', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('login uses the clinic brand on its custom host without sharing an authenticated user', async ({
    client,
    assert,
  }) => {
    const f = await fixture('clinic_owner')
    await f.tenant.merge({ custom_hosts: ['alpha.test'], primary_color: '#6d48a5' }).save()
    const response = await client.get('/login').header('host', 'alpha.test')
    response.assertStatus(200)
    const page = JSON.parse(
      response
        .text()
        .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
    )
    assert.equal(page.props.clinic.name, f.tenant.name)
    assert.equal(page.props.clinic.primary_color, '#6d48a5')
    assert.isNull(page.props.auth.user)
  })

  test('unmapped auth host preserves the existing login route with the platform brand', async ({
    client,
    assert,
  }) => {
    const response = await client.get('/login').header('host', 'unknown.test')
    response.assertStatus(200)
    const page = JSON.parse(
      response
        .text()
        .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
    )
    assert.isNull(page.props.clinic)
  })

  test('dashboard separates Brasilia dates, keeps current waiting and never leaks another tenant', async ({
    client,
    assert,
  }) => {
    const f = await fixture('clinic_owner')
    const today = DateTime.now().setZone('America/Sao_Paulo').startOf('day')
    await f.consultation.merge({ scheduled_at: today.minus({ days: 1 }) }).save()
    const records = await Consultation.createMany(
      Array.from({ length: 102 }, (_, index) => ({
        tenant_id: f.tenant.id,
        professional_id: f.consultation.professional_id,
        patient_name: `Synthetic future ${index}`,
        patient_location: 'São Paulo/SP',
        scheduled_at: today.plus({ days: index + 1 }),
        retain_until: today.plus({ years: 20 }),
        status: 'scheduled' as const,
      }))
    )
    const boundary = await Consultation.create({
      tenant_id: f.tenant.id,
      professional_id: f.consultation.professional_id,
      patient_name: 'Synthetic day boundary',
      patient_location: 'São Paulo/SP',
      scheduled_at: today.plus({ days: 1 }).minus({ seconds: 1 }),
      retain_until: today.plus({ years: 20 }),
    })
    const otherTenant = await Tenant.create({
      name: 'Other Clinic',
      slug: 'overview-other',
      is_active: true,
    })
    await f.actor.related('tenants').attach({ [otherTenant.id]: { role: 'owner' } })
    const otherProfessional = await Professional.create({
      tenant_id: otherTenant.id,
      user_id: f.doctor.id,
      crm: '123456',
      crm_uf: 'SP',
    })
    const foreign = await Consultation.create({
      tenant_id: otherTenant.id,
      professional_id: otherProfessional.id,
      patient_name: 'Foreign patient',
      patient_location: 'SP',
      scheduled_at: today,
      retain_until: today.plus({ years: 20 }),
      status: 'waiting',
    })
    const response = await client
      .get('/dashboard')
      .loginAs(f.actor)
      .header('x-tenant-id', String(f.tenant.id))
    response.assertStatus(200)
    const page = JSON.parse(
      response
        .text()
        .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
    )
    const overview = page.props.overview
    assert.deepEqual(
      overview.today.map((c: { id: number }) => c.id),
      [boundary.id]
    )
    assert.deepEqual(
      overview.waiting.map((c: { id: number }) => c.id),
      [f.consultation.id]
    )
    assert.deepEqual(
      overview.upcoming.map((c: { id: number }) => c.id),
      records.slice(0, 6).map((c) => c.id)
    )
    assert.notInclude(
      [...overview.today, ...overview.waiting, ...overview.upcoming].map((c) => c.id),
      foreign.id
    )
  })

  test('dashboard-only permission does not expose consultation data', async ({
    client,
    assert,
  }) => {
    const f = await fixture('doctor')
    await f.actor.related('roles').detach()
    const dashboard = await Permission.findByOrFail('name', 'dashboard.read')
    await f.actor.related('permissions').attach({ [dashboard.id]: { granted: true } })
    const response = await client.get('/dashboard').loginAs(f.actor)
    response.assertStatus(200)
    const page = JSON.parse(
      response
        .text()
        .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
    )
    assert.isFalse(page.props.overview.available)
    assert.deepEqual(page.props.overview.today, [])
    assert.deepEqual(page.props.overview.waiting, [])
    assert.deepEqual(page.props.overview.upcoming, [])
  })

  for (const role of ['clinic_owner', 'doctor']) {
    test(`dashboard scopes consultations and room actions for ${role}`, async ({
      client,
      assert,
    }) => {
      const f = await fixture(role)
      const response = await client.get('/dashboard').loginAs(f.actor)
      response.assertStatus(200)
      const page = JSON.parse(
        response
          .text()
          .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
      )
      assert.exists(page.props.overview)
      const overview = page.props.overview
      assert.equal(overview.today.length, 1)
      if (role === 'clinic_owner') {
        assert.equal(overview.waiting[0].id, f.consultation.id)
        assert.isFalse(overview.waiting[0].canAttend)
      } else {
        assert.lengthOf(overview.waiting, 0)
        assert.notEqual(overview.today[0].id, f.consultation.id)
        assert.isTrue(overview.today[0].canAttend)
      }
    })
  }

  for (const role of ['clinic_owner', 'admin', 'root', 'doctor']) {
    for (const [action, outcome] of [
      ['admit', undefined],
      ['video-token', undefined],
      ['end', 'completed'],
      ['end', 'referred_in_person'],
    ] as const) {
      test(`${role} cannot ${action} ${outcome ?? ''} for another professional`, async ({
        client,
        assert,
        cleanup,
      }) => {
        const f = await fixture(role)
        cleanup(() => new VideoService().close(f.tenant.id, f.consultation.id))
        if (action !== 'admit')
          await f.consultation
            .merge({
              status: 'in_progress',
              admitted_at: DateTime.utc(),
              started_at: DateTime.utc(),
            })
            .save()
        const response = await client
          .post(`/consultations/${f.consultation.id}/${action}`)
          .loginAs(f.actor)
          .withCsrfToken()
          .header('accept', 'application/json')
          .json(outcome ? { outcome } : {})
        response.assertStatus(403)
        await f.consultation.refresh()
        assert.equal(f.consultation.status, action === 'admit' ? 'waiting' : 'in_progress')
        assert.isNull(f.consultation.outcome)
      })
    }
  }

  test('obsolete broad attendance grants do not bypass professional identity', async ({
    client,
  }) => {
    const f = await fixture('clinic_owner')
    const permission = await Permission.firstOrCreate(
      { name: 'consultations.attend' },
      { resource: 'consultations', action: 'attend', context: 'any' }
    )
    await f.actor.related('permissions').attach({ [permission.id]: { granted: true } })
    const response = await client
      .post(`/consultations/${f.consultation.id}/admit`)
      .loginAs(f.actor)
      .withCsrfToken()
      .header('accept', 'application/json')
    response.assertStatus(403)
  })

  for (const outcome of ['completed', 'referred_in_person']) {
    test(`owner who is the assigned professional can admit, join and end as ${outcome}`, async ({
      client,
      assert,
      cleanup,
    }) => {
      const f = await fixture('clinic_owner', true)
      cleanup(() => new VideoService().close(f.tenant.id, f.consultation.id))
      const admit = await client
        .post(`/consultations/${f.consultation.id}/admit`)
        .loginAs(f.actor)
        .withCsrfToken()
        .header('accept', 'application/json')
      admit.assertStatus(200)
      const video = await client
        .post(`/consultations/${f.consultation.id}/video-token`)
        .loginAs(f.actor)
        .withCsrfToken()
        .header('accept', 'application/json')
      video.assertStatus(200)
      assert.equal((jwt.decode(video.body().token) as jwt.JwtPayload).name, 'Clinic')
      const end = await client
        .post(`/consultations/${f.consultation.id}/end`)
        .loginAs(f.actor)
        .withCsrfToken()
        .header('accept', 'application/json')
        .json({ outcome })
      end.assertStatus(200)
      await f.consultation.refresh()
      assert.equal(f.consultation.outcome, outcome)
    })
  }

  test('non-attending manager sees administrative details and can cancel before admission', async ({
    client,
    assert,
  }) => {
    const f = await fixture('clinic_owner')
    const detail = await client.get(`/consultations/${f.consultation.id}`).loginAs(f.actor)
    detail.assertStatus(200)
    const page = JSON.parse(
      detail
        .text()
        .match(/<script data-page="[^"]+" type="application\/json">([\s\S]*?)<\/script>/)![1]
    )
    assert.isFalse(page.props.canAttend)
    assert.isTrue(page.props.canManage)
    const room = await client
      .get(`/consultations/${f.consultation.id}/room`)
      .loginAs(f.actor)
      .header('accept', 'application/json')
    room.assertStatus(403)
    const cancel = await client
      .post(`/consultations/${f.consultation.id}/cancel`)
      .loginAs(f.actor)
      .withCsrfToken()
      .header('accept', 'application/json')
    cancel.assertStatus(200)
    await f.consultation.refresh()
    assert.equal(f.consultation.status, 'cancelled')
  })

  test('permission catalog has only contextual clinical attendance', async ({ assert }) => {
    const catalog = await app.container.make(CreateDefaultPermissionsService)
    await catalog.run()
    assert.isNull(await Permission.findBy('name', 'consultations.attend'))
    assert.isNotNull(await Permission.findBy('name', 'consultations.attend.own'))
  })
})
