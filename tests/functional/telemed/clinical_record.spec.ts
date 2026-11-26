import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Tenant from '#modules/tenants/models/tenant'
import User from '#modules/users/models/user'
import Permission from '#modules/permissions/models/permission'
import Professional from '#modules/professionals/models/professional'
import Consultation from '#modules/consultations/models/consultation'
import Consent from '#modules/consents/models/consent'
import ClinicalRecordService from '#modules/consultations/services/clinical_record_service'

async function fixture() {
  const tenant = await Tenant.create({
    name: 'Record Clinic',
    slug: 'clinical-record',
    is_active: true,
  })
  const doctor = await User.create({
    full_name: 'Original Doctor',
    email: 'record@example.test',
    password: 'Synthetic2026!',
  })
  await doctor.related('tenants').attach({ [tenant.id]: { role: 'member' } })
  for (const action of ['attend', 'read']) {
    const permission = await Permission.firstOrCreate(
      { name: `consultations.${action}.own` },
      { resource: 'consultations', action, context: 'own' }
    )
    await doctor.related('permissions').attach({ [permission.id]: { granted: true } })
  }
  const professional = await Professional.create({
    tenant_id: tenant.id,
    user_id: doctor.id,
    crm: '123456',
    crm_uf: 'SP',
    rqe: '7890',
  })
  const consultation = await Consultation.create({
    tenant_id: tenant.id,
    professional_id: professional.id,
    patient_name: 'Synthetic Patient',
    patient_location: 'São Paulo/SP',
    status: 'waiting',
    scheduled_at: DateTime.utc(),
    retain_until: DateTime.utc().plus({ years: 20 }),
  })
  await Consent.create({
    consultation_id: consultation.id,
    version: 1,
    text_hash: 'a'.repeat(64),
    accepted_at: DateTime.utc(),
    ip: '127.0.0.1',
    user_agent: 'synthetic-test',
  })
  return { tenant, doctor, professional, consultation }
}

test.group('Immutable clinical identity and attribution', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admission freezes the clinical identity and exported record ignores subsequent profile edits', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    const before = await client
      .get(`/consultations/${f.consultation.id}`)
      .loginAs(f.doctor)
      .header('accept', 'application/json')
    before.assertStatus(200)
    assert.isNull(before.body().data.professional_snapshot)
    const admitted = await client
      .post(`/consultations/${f.consultation.id}/admit`)
      .loginAs(f.doctor)
      .withCsrfToken()
      .header('accept', 'application/json')
    admitted.assertStatus(200)
    const snapshot = admitted.body().professional_snapshot
    assert.equal(snapshot.name, 'Original Doctor')
    assert.equal(snapshot.user_id, f.doctor.id)
    assert.equal(snapshot.professional_id, f.professional.id)
    assert.equal(snapshot.crm, '123456')
    assert.equal(snapshot.crm_uf, 'SP')
    assert.equal(snapshot.rqe, '7890')
    assert.equal(snapshot.capture_reason, 'admission')
    assert.equal(snapshot.captured_at, admitted.body().admitted_at)
    await f.doctor.merge({ full_name: 'Edited Doctor' }).save()
    await f.professional.merge({ crm: '654321', crm_uf: 'RJ', rqe: null }).save()
    const exported = await client
      .get(`/consultations/${f.consultation.id}`)
      .loginAs(f.doctor)
      .header('accept', 'application/json')
    exported.assertStatus(200)
    assert.deepEqual(exported.body().data.professional_snapshot, snapshot)
    assert.equal(exported.body().data.professional.name, 'Original Doctor')
    assert.equal(exported.body().data.professional.crm, '123456')
    assert.equal(exported.body().data.record_schema_version, 1)
    assert.notProperty(exported.body().data, 'clinical_note')
    assert.notProperty(exported.body().data, 'signature')
  })

  test('database rejects replacing or clearing the snapshot after admission', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    const admitted = await client
      .post(`/consultations/${f.consultation.id}/admit`)
      .loginAs(f.doctor)
      .withCsrfToken()
      .header('accept', 'application/json')
    admitted.assertStatus(200)
    const snapshot = admitted.body().professional_snapshot
    assert.exists(snapshot)
    for (const value of [null, { ...snapshot, name: 'Forged Doctor' }]) {
      await assert.rejects(
        () =>
          db.transaction(async (trx) => {
            await trx
              .from('consultations')
              .where('id', f.consultation.id)
              .update({ professional_snapshot: value })
          }),
        /professional snapshot is immutable/
      )
    }
    const row = await db.from('consultations').where('id', f.consultation.id).firstOrFail()
    assert.deepEqual(row.professional_snapshot, snapshot)
  })

  test('explicit no-show captures the deciding doctor without inventing an admission or signature', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    const ended = await client
      .post(`/consultations/${f.consultation.id}/end`)
      .loginAs(f.doctor)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ outcome: 'no_show' })
    ended.assertStatus(200)
    const record = ended.body().data
    assert.isNull(record.admitted_at)
    assert.equal(record.professional_snapshot.capture_reason, 'no_show')
    assert.equal(record.professional_snapshot.captured_at, record.ended_at)
    assert.equal(record.outcome_author.kind, 'doctor')
    assert.equal(record.outcome_author.user_id, f.doctor.id)
    assert.deepEqual(record.outcome_author.professional, record.professional_snapshot)
    assert.equal(record.outcome_author.attributed_at, record.ended_at)
    assert.notProperty(record, 'clinical_note')
    assert.notProperty(record, 'signature')
  })

  test('database rejects changing finalized authorship or its attributed decision', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    const ended = await client
      .post(`/consultations/${f.consultation.id}/end`)
      .loginAs(f.doctor)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ outcome: 'no_show' })
    ended.assertStatus(200)
    const author = ended.body().data.outcome_author
    assert.exists(author)
    for (const mutation of [
      { outcome_author: null },
      { outcome_author: { ...author, kind: 'system' } },
      { outcome: 'completed' },
      { status: 'waiting' },
      { ended_at: null },
    ]) {
      await assert.rejects(
        () =>
          db.transaction(async (trx) => {
            await trx.from('consultations').where('id', f.consultation.id).update(mutation)
          }),
        /outcome attribution is immutable/
      )
    }
  })

  test('snapshot is rolled back together with failed admission', async ({ assert }) => {
    const f = await fixture()
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          const c = await Consultation.query({ client: trx })
            .where('id', f.consultation.id)
            .forUpdate()
            .firstOrFail()
          c.merge({ status: 'in_progress', admitted_at: DateTime.utc() })
          await new ClinicalRecordService().capture(c, trx)
          await c.save()
          throw new Error('synthetic failure after snapshot persistence')
        }),
      /synthetic failure/
    )
    await f.consultation.refresh()
    assert.isNull(f.consultation.professional_snapshot)
    assert.isNull(f.consultation.admitted_at)
    assert.equal(f.consultation.status, 'waiting')
  })

  for (const kind of ['patient', 'system'] as const) {
    test(`${kind} decision does not attribute clinical authorship to the assigned doctor`, async ({
      assert,
    }) => {
      const f = await fixture()
      await db.transaction(async (trx) => {
        const c = await Consultation.query({ client: trx })
          .where('id', f.consultation.id)
          .forUpdate()
          .firstOrFail()
        c.merge({
          status: kind === 'patient' ? 'ended' : 'cancelled',
          outcome: kind === 'patient' ? 'patient_declined' : null,
          ended_at: DateTime.utc(),
        })
        await new ClinicalRecordService().attributeOutcome(
          c,
          { kind, userId: kind === 'system' ? f.doctor.id : undefined },
          trx
        )
        await c.save()
      })
      await f.consultation.refresh()
      assert.isNull(f.consultation.professional_snapshot)
      assert.equal(f.consultation.outcome_author?.kind, kind)
      assert.isNull(f.consultation.outcome_author?.professional)
      assert.equal(f.consultation.outcome_author?.user_id, kind === 'system' ? f.doctor.id : null)
    })
  }

  test('wrong doctor and non-clinical actors cannot author a medical outcome', async ({
    assert,
  }) => {
    const f = await fixture()
    const records = new ClinicalRecordService()
    for (const actor of [
      { kind: 'doctor' as const, userId: f.doctor.id + 1000 },
      { kind: 'patient' as const },
      { kind: 'system' as const, userId: f.doctor.id },
    ]) {
      await assert.rejects(
        () =>
          db.transaction(async (trx) => {
            const c = await Consultation.query({ client: trx })
              .where('id', f.consultation.id)
              .forUpdate()
              .firstOrFail()
            c.merge({ status: 'ended', outcome: 'no_show', ended_at: DateTime.utc() })
            await records.attributeOutcome(c, actor, trx)
            await c.save()
          }),
        actor.kind === 'doctor' ? /médico responsável/ : /incompatível/
      )
    }
    await f.consultation.refresh()
    assert.isNull(f.consultation.outcome_author)
    assert.isNull(f.consultation.professional_snapshot)
  })

  test('database rejects attaching a patient decision to a medical outcome and deleting authored records', async ({
    client,
    assert,
  }) => {
    const f = await fixture()
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          await trx
            .from('consultations')
            .where('id', f.consultation.id)
            .update({
              status: 'ended',
              outcome: 'completed',
              ended_at: DateTime.utc().toSQL(),
              outcome_author: {
                kind: 'patient',
                user_id: null,
                consultation_id: f.consultation.id,
                professional: null,
                external_subject: null,
                attributed_at: DateTime.utc().toISO(),
              },
            })
        }),
      /non-clinical outcome attribution is invalid/
    )
    const ended = await client
      .post(`/consultations/${f.consultation.id}/end`)
      .loginAs(f.doctor)
      .withCsrfToken()
      .header('accept', 'application/json')
      .json({ outcome: 'no_show' })
    ended.assertStatus(200)
    await assert.rejects(
      () =>
        db.transaction(async (trx) => {
          await trx.from('consultations').where('id', f.consultation.id).delete()
        }),
      /clinical record is immutable/
    )
  })
})
