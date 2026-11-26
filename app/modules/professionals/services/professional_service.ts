import ProfessionalRepository from '#modules/professionals/repositories/professional_repository'
import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import Professional from '#modules/professionals/models/professional'
import User from '#modules/users/models/user'
import Role from '#modules/roles/models/role'
import PermissionCacheService from '#modules/permissions/services/permission_cache_service'
import ConsultationAccessService from '#modules/consultations/services/consultation_access_service'
import type { Infer } from '@vinejs/vine/types'
import { professionalValidator } from '#modules/professionals/validators/professional_validator'

@inject()
export default class ProfessionalService {
  constructor(
    private repository: ProfessionalRepository,
    private access: ConsultationAccessService,
    private permissionCache: PermissionCacheService
  ) {}
  async list(tenantId: number, filter: { crm?: string; crm_uf?: string } = {}) {
    return this.repository.list(tenantId, filter)
  }
  async listForIntegration(ctx: HttpContext, filter: { crm?: string; crm_uf?: string }) {
    await this.access.requireApi(ctx, 'professionals.read')
    return this.list(ctx.tenant!.id, filter)
  }
  async save(ctx: HttpContext, payload: Infer<typeof professionalValidator>) {
    await this.access.requireClinic(
      ctx,
      ctx.params.id ? 'professionals.update' : 'professionals.create'
    )
    const result = await db.transaction(async (trx) => {
      let userId = payload.user_id
      if (ctx.params.id) {
        const p = await Professional.query({ client: trx })
          .where('tenant_id', ctx.tenant!.id)
          .where('id', Number(ctx.params.id))
          .firstOrFail()
        p.merge({ crm: payload.crm, crm_uf: payload.crm_uf, rqe: payload.rqe ?? null })
        await p.save()
        return p
      }
      if (!userId) {
        if (!payload.full_name || !payload.email || !payload.password)
          throw new Exception('Informe nome, e-mail e senha temporária do médico.', { status: 422 })
        if (await User.query({ client: trx }).where('email', payload.email).first())
          throw new Exception('Este e-mail já existe. Vincule um usuário da clínica.', {
            status: 422,
          })
        const user = await User.create(
          { full_name: payload.full_name, email: payload.email, password: payload.password },
          { client: trx }
        )
        await user.related('tenants').attach({ [ctx.tenant!.id]: { role: 'member' } }, trx)
        userId = user.id
      }
      await trx
        .from('user_tenants')
        .where('tenant_id', ctx.tenant!.id)
        .where('user_id', userId)
        .firstOrFail()
      const user = await User.query({ client: trx }).where('id', userId).forUpdate().firstOrFail()
      const role = await Role.findByOrFail('slug', 'doctor', { client: trx })
      await user.related('roles').sync([role.id], false, trx)
      return Professional.create(
        {
          tenant_id: ctx.tenant!.id,
          user_id: userId,
          crm: payload.crm,
          crm_uf: payload.crm_uf,
          rqe: payload.rqe ?? null,
        },
        { client: trx }
      )
    })
    await this.permissionCache.invalidateUserCache(result.user_id)
    return result
  }
}
