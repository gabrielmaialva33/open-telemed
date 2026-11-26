import { inject } from '@adonisjs/core'
import { Exception } from '@adonisjs/core/exceptions'
import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { randomBytes, createHash } from 'node:crypto'
import ConsultationRepository from '#modules/consultations/repositories/consultation_repository'
import ConsultationAccessService from '#modules/consultations/services/consultation_access_service'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'
import Consultation from '#modules/consultations/models/consultation'
import PatientLink from '#modules/consultations/models/patient_link'
import Professional from '#modules/professionals/models/professional'
import User from '#modules/users/models/user'
import Tenant from '#modules/tenants/models/tenant'
import Consent from '#modules/consents/models/consent'
import AuditLog from '#modules/audits/models/audit_log'
import VideoService from '#shared/services/video_service'
import env from '#start/env'
import ClinicalRecordService, {
  type OutcomeActor,
} from '#modules/consultations/services/clinical_record_service'
import VideoClosureService from '#modules/consultations/services/video_closure_service'
import HeadlessRepository from '#modules/headless/repositories/headless_repository'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { Infer } from '@vinejs/vine/types'
import {
  createConsultationValidator,
  updateConsultationValidator,
} from '#modules/consultations/validators/consultation_validator'

export function conflict(message: string): never {
  throw new Exception(message, { status: 409 })
}
export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex')

@inject()
export default class ConsultationService {
  constructor(
    private repository: ConsultationRepository,
    private access: ConsultationAccessService,
    private events: ConsultationEventService,
    private video: VideoService,
    private records: ClinicalRecordService,
    private closures: VideoClosureService,
    private headless: HeadlessRepository
  ) {}

  async visibleQuery(ctx: HttpContext) {
    await this.access.require(ctx, 'list')
    const query = this.repository.query(ctx.tenant!.id)
    if (!(await this.access.isManager(ctx))) {
      query.whereIn(
        'professional_id',
        Professional.query()
          .select('id')
          .where('tenant_id', ctx.tenant!.id)
          .where('user_id', ctx.auth.getUserOrFail().id)
      )
    }
    // Wrap the thenable builder so async resolution does not execute it yet.
    return { query }
  }

  async list(ctx: HttpContext) {
    const { query } = await this.visibleQuery(ctx)
    return query.orderBy('scheduled_at', 'desc').limit(100)
  }

  async get(ctx: HttpContext, action = 'read') {
    const c = await this.repository.find(ctx.tenant!.id, Number(ctx.params.id))
    await this.access.require(ctx, action, c)
    return c
  }

  async record(c: Consultation) {
    const p = await Professional.query()
      .where('tenant_id', c.tenant_id)
      .where('id', c.professional_id)
      .firstOrFail()
    const user = await User.findOrFail(p.user_id)
    const consent = await Consent.findBy('consultation_id', c.id)
    const closure = await db
      .from('video_closures')
      .where('tenant_id', c.tenant_id)
      .where('consultation_id', c.id)
      .first()
    return {
      ...c.toRecord(),
      ...this.records.export(c),
      video_closure: closure
        ? {
            status: closure.completed_at ? ('completed' as const) : ('pending' as const),
            mode: closure.mode as 'cloud' | 'self_hosted',
            tokens_revoked: Boolean(closure.tokens_revoked),
            attempts: Number(closure.attempts),
            completed_at: closure.completed_at
              ? new Date(closure.completed_at).toISOString()
              : null,
          }
        : null,
      modality: 'teleconsulta',
      professional: c.professional_snapshot
        ? {
            id: c.professional_snapshot.professional_id,
            name: c.professional_snapshot.name,
            crm: c.professional_snapshot.crm,
            crm_uf: c.professional_snapshot.crm_uf,
            rqe: c.professional_snapshot.rqe,
          }
        : { id: p.id, name: user.full_name, crm: p.crm, crm_uf: p.crm_uf, rqe: p.rqe },
      consent: consent
        ? {
            version: consent.version,
            text_hash: consent.text_hash,
            accepted_at: consent.accepted_at.toISO(),
          }
        : null,
    }
  }

  async create(ctx: HttpContext, payload: Infer<typeof createConsultationValidator>) {
    await this.access.require(ctx, 'create')
    const scheduledAt = DateTime.fromISO(payload.scheduled_at, { setZone: true })
    if (!scheduledAt.isValid) throw new Exception('Data da consulta inválida.', { status: 422 })
    const result = await db.transaction(async (trx) => {
      // Serialize per clinic, including the first insertion (there is no consultation row yet).
      await Tenant.query({ client: trx }).where('id', ctx.tenant!.id).forUpdate().firstOrFail()
      if (payload.external_id) {
        const existing = await this.repository
          .query(ctx.tenant!.id, trx)
          .where('external_id', payload.external_id)
          .first()
        if (existing) return { consultation: existing, patientUrl: null, created: false }
      }
      await Professional.query({ client: trx })
        .where('tenant_id', ctx.tenant!.id)
        .where('id', payload.professional_id)
        .firstOrFail()
      const consultation = await Consultation.create(
        {
          ...payload,
          tenant_id: ctx.tenant!.id,
          scheduled_at: scheduledAt,
          status: 'scheduled',
          retain_until: scheduledAt.plus({
            years: Math.max(20, env.get('CLINICAL_RETENTION_YEARS', 20)),
          }),
        },
        { client: trx }
      )
      await this.events.status(consultation, trx, ctx.auth.getUserOrFail().id)
      return { consultation, patientUrl: await this.issueLink(consultation, trx), created: true }
    })
    await this.events.dispatchPending()
    return {
      created: result.created,
      consultation: await this.record(result.consultation),
      patient_url: result.patientUrl,
      doctor_url: (await this.headless.connection(ctx.tenant!.id))
        ? null
        : `${env.get('APP_URL')}/consultations/${result.consultation.id}/room`,
    }
  }

  async link(c: Consultation) {
    return db.transaction(async (trx) => {
      const locked = await this.repository.find(c.tenant_id, c.id, trx)
      const url = await this.issueLink(locked, trx)
      await this.events.audit(locked, 'patient_link_issued', trx)
      return url
    })
  }

  private async issueLink(c: Consultation, trx: TransactionClientContract) {
    if (['ended', 'cancelled'].includes(c.status)) conflict('Consulta encerrada.')
    const secret = randomBytes(32).toString('base64url')
    await PatientLink.query({ client: trx })
      .where('consultation_id', c.id)
      .update({ expires_at: DateTime.utc().toSQL(), session_hash: null, session_expires_at: null })
    await PatientLink.create(
      {
        consultation_id: c.id,
        secret_hash: hashSecret(secret),
        expires_at: DateTime.max(
          c.scheduled_at.plus({ days: 1 }),
          DateTime.now().plus({ hours: 3 })
        ),
      },
      { client: trx }
    )
    const tenant = await Tenant.findOrFail(c.tenant_id, { client: trx })
    const connection = await this.headless.connection(c.tenant_id, trx)
    if (connection) {
      if (!connection.active) conflict('Integração desabilitada.')
      return `${connection.patient_url}#${secret}`
    }
    const origin = tenant.custom_hosts?.[0]
      ? `https://${tenant.custom_hosts[0]}`
      : env.get('APP_URL')
    const path =
      tenant.custom_hosts?.[0] || env.get('NODE_ENV') === 'production'
        ? '/c'
        : `/t/${tenant.slug}/c`
    return `${origin}${path}#${secret}`
  }

  async update(ctx: HttpContext, payload: Infer<typeof updateConsultationValidator>) {
    if (payload.professional_id === undefined && payload.scheduled_at === undefined)
      throw new Exception('Informe horário ou profissional.', { status: 422 })
    const c = await this.get(ctx, 'update')
    const result = await db.transaction(async (trx) => {
      const locked = await this.repository.find(c.tenant_id, c.id, trx)
      if (locked.status !== 'scheduled') conflict('Só consultas agendadas podem ser alteradas.')
      if (payload.professional_id !== undefined) {
        await Professional.query({ client: trx })
          .where('tenant_id', c.tenant_id)
          .where('id', payload.professional_id)
          .firstOrFail()
        locked.professional_id = payload.professional_id
      }
      if (payload.scheduled_at !== undefined) {
        const scheduledAt = DateTime.fromISO(payload.scheduled_at, { setZone: true })
        if (!scheduledAt.isValid) throw new Exception('Data da consulta inválida.', { status: 422 })
        locked.scheduled_at = scheduledAt
        locked.retain_until = DateTime.max(
          locked.retain_until,
          scheduledAt.plus({ years: Math.max(20, env.get('CLINICAL_RETENTION_YEARS', 20)) })
        )
      }
      await locked.save()
      await this.events.status(locked, trx, ctx.auth.getUserOrFail().id, 'consultation.updated')
      return locked
    })
    await this.events.dispatchPending()
    return this.record(result)
  }

  async admit(ctx: HttpContext) {
    const c = await this.get(ctx, 'attend')
    return this.admitFor(c, ctx.auth.getUserOrFail().id, (locked, trx) =>
      this.access.assertAssignedProfessional(ctx, locked, trx)
    )
  }

  async admitFor(
    c: Consultation,
    userId: number,
    authorize: (c: Consultation, trx: TransactionClientContract) => Promise<unknown>
  ) {
    const result = await db.transaction(async (trx) => {
      const locked = await this.repository.find(c.tenant_id, c.id, trx)
      await authorize(locked, trx)
      const consent = await Consent.query({ client: trx }).where('consultation_id', c.id).first()
      if (locked.status !== 'waiting' || !consent)
        conflict('O paciente precisa consentir e entrar na espera antes da admissão.')
      locked.merge({
        status: 'in_progress',
        admitted_at: DateTime.utc(),
        started_at: DateTime.utc(),
      })
      await this.records.capture(locked, trx)
      await locked.save()
      await this.events.audit(locked, 'admitted', trx, userId)
      await this.events.status(locked, trx, userId)
      return locked
    })
    await this.events.dispatchPending()
    return this.record(result)
  }

  async doctorToken(ctx: HttpContext) {
    const c = await this.get(ctx, 'attend')
    return this.doctorTokenFor(c, ctx.auth.getUserOrFail().id, (locked, trx) =>
      this.access.assertAssignedProfessional(ctx, locked, trx)
    )
  }

  async doctorTokenFor(
    c: Consultation,
    userId: number,
    authorize: (c: Consultation, trx: TransactionClientContract) => Promise<unknown>
  ) {
    const user = await User.findOrFail(userId)
    return this.video.token(
      c.tenant_id,
      c.id,
      'doctor',
      c.professional_snapshot?.name ?? user.full_name,
      authorize
    )
  }

  async finish(
    c: Consultation,
    status: 'ended' | 'cancelled',
    outcome: Consultation['outcome'],
    userId?: number,
    authorize?: (c: Consultation, trx: TransactionClientContract) => Promise<unknown>,
    actor?: OutcomeActor
  ) {
    const result = await db.transaction(async (trx) => {
      const locked = await this.repository.find(c.tenant_id, c.id, trx)
      if (authorize) await authorize(locked, trx)
      if (['ended', 'cancelled'].includes(locked.status)) conflict('Consulta já encerrada.')
      if (status === 'cancelled' && locked.status === 'in_progress')
        conflict('Encerre a consulta em andamento com um desfecho.')
      if (
        status === 'ended' &&
        ['completed', 'referred_in_person'].includes(outcome ?? '') &&
        locked.status !== 'in_progress'
      )
        conflict('A consulta ainda não foi iniciada.')
      locked.merge({ status, outcome, ended_at: DateTime.utc() })
      await this.records.attributeOutcome(
        locked,
        actor ??
          (outcome === 'patient_declined'
            ? { kind: 'patient' }
            : outcome
              ? { kind: 'doctor', userId }
              : { kind: 'system', userId }),
        trx
      )
      await locked.save()
      await this.closures.schedule(locked, trx)
      await this.events.status(locked, trx, userId)
      return locked
    })
    await this.events.dispatchPending()
    await this.closures.attempt(c.tenant_id, c.id)
    return this.record(result)
  }

  async audit(ctx: HttpContext) {
    const c = await this.get(ctx, 'audit')
    const logs = await AuditLog.query()
      .where('resource', 'consultations')
      .where('resource_id', c.id)
      .orderBy('id')
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      created_at: log.created_at,
      metadata: log.metadata,
    }))
  }
}
