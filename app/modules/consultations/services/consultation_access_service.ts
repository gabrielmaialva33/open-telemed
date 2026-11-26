import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Professional from '#modules/professionals/models/professional'
import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import ForbiddenException from '#exceptions/forbidden_exception'
import PermissionService from '#modules/permissions/services/permission_service'
import Consultation from '#modules/consultations/models/consultation'
import OwnershipService from '#shared/services/ownership_service'
import HeadlessRepository from '#modules/headless/repositories/headless_repository'

@inject()
export default class ConsultationAccessService {
  constructor(
    private permissions: PermissionService,
    private ownership: OwnershipService,
    private headless: HeadlessRepository
  ) {}

  async isManager(ctx: HttpContext) {
    const tenant = await ctx.auth
      .getUserOrFail()
      .related('tenants')
      .query()
      .where('tenants.id', ctx.tenant!.id)
      .firstOrFail()
    return ['owner', 'admin'].includes(tenant.$extras.pivot_role)
  }

  async attendingProfessionalIds(ctx: HttpContext) {
    const userId = ctx.auth.getUserOrFail().id
    const permissions = await this.permissions.getEffectivePermissions(userId)
    const allowed = permissions.some(
      (permission) =>
        permission.resource === 'consultations' &&
        permission.action === 'attend' &&
        ['own', 'any'].includes(permission.context)
    )
    if (!allowed || !ctx.tenant || (await this.headless.connection(ctx.tenant.id)))
      return new Set<number>()
    const professionals = await Professional.query()
      .where('tenant_id', ctx.tenant.id)
      .where('user_id', userId)
      .select('id')
    return new Set(professionals.map((professional) => professional.id))
  }

  async assertAssignedProfessional(
    ctx: HttpContext,
    c: Consultation,
    trx: TransactionClientContract
  ) {
    const professional = await Professional.query({ client: trx })
      .where('tenant_id', c.tenant_id)
      .where('id', c.professional_id)
      .where('user_id', ctx.auth.getUserOrFail().id)
      .first()
    if (!professional || c.tenant_id !== ctx.tenant?.id)
      throw new ForbiddenException('Somente o médico responsável pode atender esta consulta.')
  }

  async canAttend(ctx: HttpContext, consultation: Consultation) {
    if (
      consultation.tenant_id !== ctx.tenant?.id ||
      (await this.headless.connection(consultation.tenant_id))
    )
      return false
    const userId = ctx.auth.getUserOrFail().id
    // Clinical identity is mandatory, even for administrators and broad legacy grants.
    if (
      !(await this.ownership.checkOwnership({
        userId,
        resource: 'consultations',
        resourceId: consultation.id,
        action: 'attend',
        context: 'own',
      }))
    )
      return false
    return this.permissions.checkUserPermission({
      user_id: userId,
      permission: 'consultations.attend.own',
      resource_id: consultation.id,
    })
  }

  async require(ctx: HttpContext, action: string, consultation?: Consultation) {
    const user = ctx.auth.getUserOrFail()
    const isApi = ctx.request.url().startsWith('/api/')
    if (action === 'attend') {
      if (!isApi && consultation && (await this.canAttend(ctx, consultation))) return
      throw new ForbiddenException('Somente o médico responsável pode atender esta consulta.')
    }
    const permission = `consultations.${action}`
    if (isApi) {
      const token = ctx.auth.use('api').user?.currentAccessToken
      if (!token || !token.allows(permission))
        throw new ForbiddenException('Token sem permissão para esta operação.')
    }
    const manager = await this.isManager(ctx)
    if (
      (manager || isApi) &&
      (await this.permissions.checkUserPermission({ user_id: user.id, permission }))
    )
      return
    if (
      !isApi &&
      consultation &&
      (await this.permissions.checkUserPermission({
        user_id: user.id,
        permission: `${permission}.own`,
        resource_id: consultation.id,
      }))
    ) {
      if (
        await this.ownership.checkOwnership({
          userId: user.id,
          resource: 'consultations',
          resourceId: consultation.id,
          action,
          context: 'own',
        })
      )
        return
    }
    if (
      !isApi &&
      action === 'list' &&
      (await this.permissions.checkUserPermission({ user_id: user.id, permission }))
    )
      return
    throw new ForbiddenException('Você não tem permissão para esta consulta.')
  }

  async requireApi(ctx: HttpContext, permission: string) {
    const token = ctx.auth.use('api').user?.currentAccessToken
    if (
      !token?.allows(permission) ||
      !(await this.permissions.checkUserPermission({
        user_id: ctx.auth.getUserOrFail().id,
        permission,
      }))
    )
      throw new ForbiddenException('Token sem permissão para esta operação.')
  }

  async requireClinic(ctx: HttpContext, permission: string) {
    if (
      !(await this.isManager(ctx)) ||
      !(await this.permissions.checkUserPermission({
        user_id: ctx.auth.getUserOrFail().id,
        permission,
      }))
    ) {
      throw new ForbiddenException(
        'Somente a administração desta clínica pode realizar esta operação.'
      )
    }
  }
}
