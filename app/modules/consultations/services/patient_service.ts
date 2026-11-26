import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import NotFoundException from '#exceptions/not_found_exception'
import Tenant from '#modules/tenants/models/tenant'
import PublicClinicService, { publicClinic } from '#modules/tenants/services/public_clinic_service'
import Consultation from '#modules/consultations/models/consultation'
import PatientLink from '#modules/consultations/models/patient_link'
import Consent from '#modules/consents/models/consent'
import ConsentText from '#modules/consents/models/consent_text'
import ConsentTextService from '#modules/consents/services/consent_text_service'
import ConsultationService, {
  hashSecret,
  conflict,
} from '#modules/consultations/services/consultation_service'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'
import VideoService from '#shared/services/video_service'
import type { Infer } from '@vinejs/vine/types'
import {
  patientConsentValidator,
  patientContextValidator,
} from '#modules/consultations/validators/consultation_validator'
import env from '#start/env'

@inject()
export default class PatientService {
  constructor(
    private clinics: PublicClinicService,
    private terms: ConsentTextService,
    private events: ConsultationEventService,
    private consultations: ConsultationService,
    private video: VideoService
  ) {}

  private async boundClinic(ctx: HttpContext, c: Consultation) {
    const hostClinic = await this.clinics.resolve(ctx)
    const clinic = await Tenant.query()
      .where('id', c.tenant_id)
      .where('is_active', true)
      .firstOrFail()
    if (hostClinic && hostClinic.id !== clinic.id)
      throw new NotFoundException('Link inválido para esta clínica.')
    return clinic
  }

  async exchange(ctx: HttpContext, secret: string) {
    const link = await PatientLink.query()
      .where('secret_hash', hashSecret(secret))
      .where('expires_at', '>', DateTime.utc().toSQL()!)
      .first()
    if (!link) throw new NotFoundException('Link inválido ou expirado.')
    const c = await Consultation.findOrFail(link.consultation_id)
    await this.boundClinic(ctx, c)
    if (['ended', 'cancelled'].includes(c.status)) conflict('Consulta encerrada.')
    const session = randomBytes(32).toString('base64url')
    const consent = await Consent.findBy('consultation_id', c.id)
    const term = consent
      ? await ConsentText.query()
          .where('tenant_id', c.tenant_id)
          .where('version', consent.version)
          .firstOrFail()
      : await this.terms.current(c.tenant_id)
    link.merge({
      session_hash: hashSecret(session),
      session_expires_at: DateTime.min(link.expires_at, DateTime.utc().plus({ hours: 3 })),
      consent_version: term.version,
    })
    await link.save()
    ctx.response.cookie(`telemed_patient_${c.id}`, session, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.get('NODE_ENV') === 'production',
      path: '/',
      maxAge: '3h',
    })
    return this.state(ctx, c, link)
  }

  async session(ctx: HttpContext) {
    const { consultation_id: consultationId } = await patientContextValidator.validate(
      ctx.request.qs()
    )
    if (!consultationId)
      throw new Exception('Sessão expirada. Abra novamente o link.', { status: 401 })
    const link = await this.validSessionLink(ctx, consultationId)
    const c = await Consultation.findOrFail(link.consultation_id)
    await this.boundClinic(ctx, c)
    return { c, link }
  }

  private async validSessionLink(
    ctx: HttpContext,
    consultationId: number,
    trx?: TransactionClientContract
  ) {
    const secret = ctx.request.cookie(`telemed_patient_${consultationId}`)
    if (typeof secret !== 'string')
      throw new Exception('Sessão expirada. Abra novamente o link.', { status: 401 })
    const link = await PatientLink.query(trx ? { client: trx } : {})
      .where('consultation_id', consultationId)
      .where('session_hash', hashSecret(secret))
      .where('expires_at', '>', DateTime.utc().toSQL()!)
      .where('session_expires_at', '>', DateTime.utc().toSQL()!)
      .first()
    if (!link) throw new Exception('Sessão expirada. Abra novamente o link.', { status: 401 })
    return link
  }

  async state(ctx: HttpContext, c: Consultation, link: PatientLink) {
    const clinic = await this.boundClinic(ctx, c)
    const consent = await Consent.findBy('consultation_id', c.id)
    const term = await ConsentText.query()
      .where('tenant_id', c.tenant_id)
      .where('version', consent?.version ?? link.consent_version ?? 0)
      .firstOrFail()
    return {
      clinic: publicClinic(clinic),
      consultation: {
        id: c.id,
        status: c.status,
        outcome: c.outcome,
        patient_name: c.patient_name.split(/\s+/)[0],
        scheduled_at: c.scheduled_at.toISO(),
        consented: Boolean(consent),
        admitted: Boolean(c.admitted_at),
        recording_allowed: c.recording_allowed,
      },
      term: { version: term.version, hash: term.hash, body: term.body },
    }
  }

  async accept(ctx: HttpContext, payload: Infer<typeof patientConsentValidator>) {
    const { c } = await this.session(ctx)
    if (Boolean(payload.representative_name) !== Boolean(payload.representative_document))
      throw new Exception('Informe nome e documento do representante legal.', { status: 422 })
    await db.transaction(async (trx) => {
      const locked = await Consultation.query({ client: trx })
        .where('tenant_id', c.tenant_id)
        .where('id', c.id)
        .forUpdate()
        .firstOrFail()
      const link = await this.validSessionLink(ctx, c.id, trx)
      if (locked.status !== 'scheduled')
        conflict('O consentimento já foi registrado ou a consulta foi encerrada.')
      const term = await ConsentText.query({ client: trx })
        .where('tenant_id', c.tenant_id)
        .where('version', link.consent_version ?? 0)
        .firstOrFail()
      if (
        payload.version !== term.version ||
        !timingSafeEqual(Buffer.from(payload.text_hash, 'hex'), Buffer.from(term.hash, 'hex'))
      )
        conflict('O termo informado não corresponde ao termo exibido. Reabra o link.')
      await Consent.create(
        {
          consultation_id: c.id,
          version: term.version,
          text_hash: term.hash,
          accepted_at: DateTime.utc(),
          ip: ctx.request.ip(),
          user_agent: (ctx.request.header('user-agent') || '').slice(0, 2048),
          representative_name: payload.representative_name,
          representative_document: payload.representative_document,
        },
        { client: trx }
      )
      locked.merge({ status: 'waiting', recording_allowed: payload.recording_allowed ?? false })
      await locked.save()
      await this.events.audit(locked, 'consented', trx, undefined, {
        version: term.version,
        text_hash: term.hash,
      })
      await this.events.status(locked, trx)
    })
    await this.events.dispatchPending()
    await c.refresh()
    return this.state(ctx, c, await this.validSessionLink(ctx, c.id))
  }

  async token(ctx: HttpContext) {
    const { c } = await this.session(ctx)
    if (
      c.status !== 'in_progress' ||
      !c.admitted_at ||
      !(await Consent.findBy('consultation_id', c.id))
    )
      conflict('Aguarde o aceite do termo e a admissão pelo médico.')
    return this.video.token(c.tenant_id, c.id, 'patient', c.patient_name, (_locked, trx) =>
      this.validSessionLink(ctx, c.id, trx)
    )
  }

  async decline(ctx: HttpContext) {
    const { c } = await this.session(ctx)
    await this.consultations.finish(c, 'ended', 'patient_declined', undefined, (_locked, trx) =>
      this.validSessionLink(ctx, c.id, trx)
    )
    return { status: 'ended', outcome: 'patient_declined' }
  }
}
