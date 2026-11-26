import { Exception } from '@adonisjs/core/exceptions'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Consultation from '#modules/consultations/models/consultation'
import Professional from '#modules/professionals/models/professional'
import User from '#modules/users/models/user'

export interface OutcomeActor {
  kind: 'doctor' | 'patient' | 'system'
  userId?: number
  externalSubject?: string
}

/** Called with a locked consultation in the same transaction as the state transition. */
export default class ClinicalRecordService {
  async capture(
    c: Consultation,
    trx: TransactionClientContract,
    reason: 'admission' | 'no_show' = 'admission'
  ) {
    if (c.professional_snapshot) return c.professional_snapshot
    const at = reason === 'admission' ? c.admitted_at : c.ended_at
    if (!at || (reason === 'no_show' && c.outcome !== 'no_show')) {
      throw new Exception('Momento de identificação clínica inválido.', { status: 409 })
    }
    // Lock both sources so concurrent profile edits cannot produce a mixed identity.
    const professional = await Professional.query({ client: trx })
      .where('tenant_id', c.tenant_id)
      .where('id', c.professional_id)
      .forShare()
      .firstOrFail()
    const user = await User.query({ client: trx })
      .where('id', professional.user_id)
      .forShare()
      .firstOrFail()
    c.professional_snapshot = {
      professional_id: professional.id,
      user_id: user.id,
      name: user.full_name,
      crm: professional.crm,
      crm_uf: professional.crm_uf,
      rqe: professional.rqe ?? null,
      captured_at: at.toISO()!,
      capture_reason: reason,
    }
    return c.professional_snapshot
  }

  async attributeOutcome(c: Consultation, actor: OutcomeActor, trx: TransactionClientContract) {
    if (c.outcome_author || !c.ended_at || !['ended', 'cancelled'].includes(c.status)) {
      throw new Exception('Atribuição de desfecho inválida.', { status: 409 })
    }
    if (actor.kind === 'doctor') {
      if (!['completed', 'referred_in_person', 'no_show'].includes(c.outcome ?? '')) {
        throw new Exception('Desfecho não é uma decisão médica.', { status: 409 })
      }
      const professional = await Professional.query({ client: trx })
        .where('tenant_id', c.tenant_id)
        .where('id', c.professional_id)
        .forShare()
        .firstOrFail()
      if (!actor.userId || professional.user_id !== actor.userId) {
        throw new Exception('Somente o médico responsável pode registrar a autoria do desfecho.', {
          status: 403,
        })
      }
      if (!c.professional_snapshot && c.outcome === 'no_show') await this.capture(c, trx, 'no_show')
      if (
        !c.professional_snapshot ||
        c.professional_snapshot.professional_id !== professional.id ||
        c.professional_snapshot.user_id !== actor.userId
      ) {
        throw new Exception('Identidade clínica não corresponde ao médico responsável.', {
          status: 409,
        })
      }
    } else if (
      (actor.kind === 'patient' && c.outcome !== 'patient_declined') ||
      (actor.kind === 'system' && c.outcome !== null)
    ) {
      throw new Exception('Desfecho incompatível com sua autoria.', { status: 409 })
    }
    c.outcome_author = {
      kind: actor.kind,
      user_id: actor.userId ?? null,
      external_subject: actor.externalSubject ?? null,
      consultation_id: c.id,
      attributed_at: c.ended_at.toISO()!,
      professional: actor.kind === 'doctor' ? c.professional_snapshot : null,
    }
    return c.outcome_author
  }

  export(c: Consultation) {
    return {
      record_schema_version: 1 as const,
      professional_snapshot: c.professional_snapshot ?? null,
      outcome_author: c.outcome_author ?? null,
    }
  }
}
