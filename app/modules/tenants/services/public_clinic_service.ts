import { type HttpContext } from '@adonisjs/core/http'
import Tenant from '#modules/tenants/models/tenant'
import NotFoundException from '#exceptions/not_found_exception'
import env from '#start/env'

export function publicClinic(tenant: Tenant) {
  return {
    name: tenant.name,
    slug: tenant.slug,
    logo_url: tenant.logo_url,
    primary_color: tenant.primary_color,
    accent_color: tenant.accent_color,
    legal_name: tenant.legal_name,
    cnpj: tenant.cnpj,
    crm_pj: tenant.crm_pj,
    crm_pj_uf: tenant.crm_pj_uf,
    technical_director_name: tenant.technical_director_name,
    technical_director_crm: tenant.technical_director_crm,
    technical_director_uf: tenant.technical_director_uf,
  }
}

export default class PublicClinicService {
  async resolve(ctx: HttpContext) {
    // Forwarded host is opt-in only. The trusted proxy must overwrite it.
    const raw = env.get('TRUST_PROXY', false)
      ? ctx.request.header('x-forwarded-host') || ctx.request.header('host')
      : ctx.request.header('host')
    if (!raw || !/^[a-z0-9.-]+(?::\d+)?$/i.test(raw))
      throw new NotFoundException('Clínica não encontrada.')
    const host = raw.toLowerCase().split(':')[0]
    const platform = env
      .get('PLATFORM_HOSTS')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .includes(host)
    if (ctx.params.slug) {
      if (env.get('NODE_ENV') === 'production' || !platform)
        throw new NotFoundException('Clínica não encontrada.')
      const tenant = await Tenant.query()
        .where('is_active', true)
        .where('slug', ctx.params.slug)
        .first()
      if (!tenant) throw new NotFoundException('Clínica não encontrada.')
      return tenant
    }
    const custom = await Tenant.query()
      .where('is_active', true)
      .whereRaw('custom_hosts @> ?::jsonb', [JSON.stringify([host])])
      .limit(2)
    if (custom.length > 1) throw new NotFoundException('Clínica não encontrada.')
    if (custom[0]) return custom[0]
    if (platform) return null
    throw new NotFoundException('Clínica não encontrada.')
  }
}
