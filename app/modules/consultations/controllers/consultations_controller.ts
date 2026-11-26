import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import ConsultationService from '#modules/consultations/services/consultation_service'
import ConsultationAccessService from '#modules/consultations/services/consultation_access_service'
import {
  createConsultationValidator,
  updateConsultationValidator,
  endConsultationValidator,
} from '#modules/consultations/validators/consultation_validator'
import Tenant from '#modules/tenants/models/tenant'
import ProfessionalService from '#modules/professionals/services/professional_service'
import { publicClinic } from '#modules/tenants/services/public_clinic_service'

@inject()
export default class ConsultationsController {
  constructor(
    private service: ConsultationService,
    private access: ConsultationAccessService,
    private professionals: ProfessionalService
  ) {}

  async index(ctx: HttpContext) {
    const consultations = await this.service.list(ctx)
    const clinic = await Tenant.findOrFail(ctx.tenant!.id)
    return ctx.inertia.render('telemed/consultations', {
      clinic: publicClinic(clinic),
      consultations: consultations.map((c) => c.toRecord()),
      canManage: await this.access.isManager(ctx),
      professionals: await this.professionals.list(ctx.tenant!.id),
    })
  }

  async show(ctx: HttpContext) {
    const room = ctx.request.url().endsWith('/room')
    const c = await this.service.get(ctx, room ? 'attend' : 'read')
    const data = await this.service.record(c)
    if (ctx.request.url().startsWith('/api/') || ctx.request.accepts(['html', 'json']) === 'json')
      return { data }
    return ctx.inertia.render('telemed/consultation', {
      clinic: publicClinic(await Tenant.findOrFail(c.tenant_id)),
      consultation: data,
      room,
      canAttend: await this.access.canAttend(ctx, c),
      canManage: await this.access.isManager(ctx),
    })
  }

  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createConsultationValidator)
    const result = await this.service.create(ctx, payload)
    ctx.response.header('Cache-Control', 'no-store')
    return ctx.response.status(result.created ? 201 : 200).send(result)
  }

  async link(ctx: HttpContext) {
    ctx.response.header('Cache-Control', 'no-store')
    const c = await this.service.get(ctx, ctx.request.url().startsWith('/api/') ? 'link' : 'read')
    return { patient_url: await this.service.link(c) }
  }

  async update(ctx: HttpContext) {
    return {
      data: await this.service.update(
        ctx,
        await ctx.request.validateUsing(updateConsultationValidator)
      ),
    }
  }

  async admit(ctx: HttpContext) {
    return this.service.admit(ctx)
  }
  async token(ctx: HttpContext) {
    return this.service.doctorToken(ctx)
  }
  async audit(ctx: HttpContext) {
    return { data: await this.service.audit(ctx) }
  }
  async cancel(ctx: HttpContext) {
    const c = await this.service.get(ctx, 'cancel')
    return { data: await this.service.finish(c, 'cancelled', null, ctx.auth.getUserOrFail().id) }
  }
  async end(ctx: HttpContext) {
    const c = await this.service.get(ctx, 'attend')
    const { outcome } = await ctx.request.validateUsing(endConsultationValidator)
    return {
      data: await this.service.finish(
        c,
        'ended',
        outcome,
        ctx.auth.getUserOrFail().id,
        (locked, trx) => this.access.assertAssignedProfessional(ctx, locked, trx)
      ),
    }
  }
}
