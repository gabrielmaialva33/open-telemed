import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import Tenant from '#modules/tenants/models/tenant'
import { publicClinic } from '#modules/tenants/services/public_clinic_service'
import ConsultationAccessService from '#modules/consultations/services/consultation_access_service'
import ProfessionalService from '#modules/professionals/services/professional_service'
import {
  professionalValidator,
  professionalLookupValidator,
} from '#modules/professionals/validators/professional_validator'
import ConsentTextService from '#modules/consents/services/consent_text_service'
import BrandingService from '#modules/tenants/services/branding_service'
import {
  brandingValidator,
  consentTextValidator,
} from '#modules/tenants/validators/branding_validator'

@inject()
export default class ClinicController {
  constructor(
    private access: ConsultationAccessService,
    private professionals: ProfessionalService,
    private terms: ConsentTextService,
    private branding: BrandingService
  ) {}
  async apiIndex(ctx: HttpContext) {
    return {
      data: await this.professionals.listForIntegration(
        ctx,
        await professionalLookupValidator.validate(ctx.request.qs())
      ),
    }
  }
  async professionalsPage(ctx: HttpContext) {
    await this.access.requireClinic(ctx, 'professionals.read')
    const clinic = await Tenant.findOrFail(ctx.tenant!.id)
    const members = await clinic.related('users').query().select('users.id', 'users.full_name')
    return ctx.inertia.render('telemed/professionals', {
      clinic: publicClinic(clinic),
      professionals: await this.professionals.list(clinic.id),
      members: members.map((u) => ({ id: u.id, full_name: u.full_name })),
    })
  }
  async saveProfessional(ctx: HttpContext) {
    return ctx.response.created(
      await this.professionals.save(ctx, await ctx.request.validateUsing(professionalValidator))
    )
  }
  async settings(ctx: HttpContext) {
    await this.access.requireClinic(ctx, 'tenant_branding.update')
    const clinic = await Tenant.findOrFail(ctx.tenant!.id)
    const term = await this.terms.current(clinic.id)
    return ctx.inertia.render('telemed/clinic', {
      clinic: publicClinic(clinic),
      settings: {
        ...publicClinic(clinic),
        custom_hosts: clinic.custom_hosts,
        webhook_url: clinic.webhook_url,
        has_webhook_secret: Boolean(clinic.webhook_secret),
      },
      term: { version: term.version, hash: term.hash, body: term.body },
    })
  }
  async saveSettings(ctx: HttpContext) {
    await this.branding.save(ctx, await ctx.request.validateUsing(brandingValidator))
    return { saved: true }
  }
  async publishTerm(ctx: HttpContext) {
    await this.access.requireClinic(ctx, 'consent_texts.create')
    const { body } = await ctx.request.validateUsing(consentTextValidator)
    const term = await this.terms.publish(ctx.tenant!.id, body)
    return ctx.response.created({ version: term.version, hash: term.hash, body: term.body })
  }
}
