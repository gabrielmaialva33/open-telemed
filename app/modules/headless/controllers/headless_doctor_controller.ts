import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Consultation from '#modules/consultations/models/consultation'
import Professional from '#modules/professionals/models/professional'
import ConsultationRepository from '#modules/consultations/repositories/consultation_repository'
import ConsultationService from '#modules/consultations/services/consultation_service'
import ConsultationEventService from '#modules/consultations/services/consultation_event_service'
import HeadlessAccessService from '#modules/headless/services/headless_access_service'
import { assertionValidator } from '#modules/headless/validators/headless_validator'

@inject()
export default class HeadlessDoctorController {
  constructor(
    private access: HeadlessAccessService,
    private repository: ConsultationRepository,
    private consultations: ConsultationService,
    private events: ConsultationEventService
  ) {}
  async handle(ctx: HttpContext) {
    const connection = await this.access.connection(ctx, 'doctor')
    const consultation = await this.repository.find(connection.tenant_id, Number(ctx.params.id))
    const { assertion } = await ctx.request.validateUsing(assertionValidator)
    const claims = await this.access.claims(connection, assertion)
    const action = ctx.request.url().split('/').at(-1) as typeof claims.action
    const professional = await Professional.query()
      .where('tenant_id', connection.tenant_id)
      .where('id', consultation.professional_id)
      .firstOrFail()
    const authorize = async (locked: Consultation, trx: TransactionClientContract) => {
      const actor = await this.access.authorize(connection, claims, locked, action, trx)
      if (actor.userId !== professional.user_id)
        throw new Exception('Médico alterado. Tente novamente.', { status: 403 })
      await this.events.audit(locked, 'delegated_doctor_action', trx, actor.userId, {
        action,
        service_user_id: connection.service_user_id,
        connection_id: connection.id,
        external_subject: claims.sub,
      })
    }
    switch (action) {
      case 'state': {
        const current = await db.transaction(async (trx) => {
          const locked = await this.repository.find(connection.tenant_id, consultation.id, trx)
          await authorize(locked, trx)
          return locked
        })
        return { data: await this.consultations.record(current) }
      }
      case 'admit':
        return {
          data: await this.consultations.admitFor(consultation, professional.user_id, authorize),
        }
      case 'video-token':
        return this.consultations.doctorTokenFor(consultation, professional.user_id, authorize)
      case 'end':
        if (!claims.outcome) throw new Exception('Informe o desfecho na asserção.', { status: 422 })
        return {
          data: await this.consultations.finish(
            consultation,
            'ended',
            claims.outcome,
            professional.user_id,
            authorize,
            { kind: 'doctor', userId: professional.user_id, externalSubject: claims.sub }
          ),
        }
    }
  }
}
