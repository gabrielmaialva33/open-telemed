import { assertWebhookDestination } from '#modules/consultations/support/webhook_destination'
import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import Tenant from '#modules/tenants/models/tenant'
import ConsultationAccessService from '#modules/consultations/services/consultation_access_service'
import type { Infer } from '@vinejs/vine/types'
import { brandingValidator } from '#modules/tenants/validators/branding_validator'
import env from '#start/env'

@inject()
export default class BrandingService {
  constructor(private access: ConsultationAccessService) {}
  async save(ctx: HttpContext, payload: Infer<typeof brandingValidator>) {
    await this.access.requireClinic(ctx, 'tenant_branding.update')
    if (payload.webhook_url) assertWebhookDestination(payload.webhook_url)
    return db.transaction(async (trx) => {
      const clinics = await Tenant.query({ client: trx }).orderBy('id').forUpdate()
      const clinic = clinics.find((item) => item.id === ctx.tenant!.id)!
      const reserved = env
        .get('PLATFORM_HOSTS')
        .split(',')
        .map((host) => host.trim().toLowerCase())
      if (
        payload.custom_hosts.some(
          (host) =>
            reserved.includes(host) ||
            clinics.some((item) => item.id !== clinic.id && item.custom_hosts.includes(host))
        )
      )
        throw new Exception('Um domínio informado já está em uso.', { status: 422 })
      if (payload.webhook_url && !payload.webhook_secret && !clinic.webhook_secret)
        throw new Exception('Defina um segredo com pelo menos 32 caracteres.', { status: 422 })
      clinic.merge(payload)
      await clinic.save()
      return clinic
    })
  }
}
