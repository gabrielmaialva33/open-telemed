import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import GetConsultationOverviewService from '#modules/web/services/get_consultation_overview_service'
import Tenant from '#modules/tenants/models/tenant'
import { publicClinic } from '#modules/tenants/services/public_clinic_service'

@inject()
export default class InertiaDashboardController {
  constructor(private overview: GetConsultationOverviewService) {}

  async index(ctx: HttpContext) {
    return ctx.inertia.render('dashboard', {
      clinic: ctx.tenant ? publicClinic(await Tenant.findOrFail(ctx.tenant.id)) : null,
      overview: await this.overview.run(ctx),
    })
  }
}
