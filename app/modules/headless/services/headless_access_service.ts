import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import jwt from 'jsonwebtoken'
import type Consultation from '#modules/consultations/models/consultation'
import ConsultationAccessService from '#modules/consultations/services/consultation_access_service'
import HeadlessRepository, {
  type HeadlessConnection,
} from '#modules/headless/repositories/headless_repository'
import { claimsValidator } from '#modules/headless/validators/headless_validator'

export type DoctorClaims = Awaited<ReturnType<typeof claimsValidator.validate>>
@inject()
export default class HeadlessAccessService {
  constructor(
    private repository: HeadlessRepository,
    private access: ConsultationAccessService
  ) {}

  async connection(ctx: HttpContext, kind: 'doctor' | 'patient') {
    await this.access.requireApi(ctx, `consultations.headless_${kind}`)
    const connection = await this.repository.connection(ctx.tenant!.id)
    if (!connection?.active || connection.service_user_id !== ctx.auth.getUserOrFail().id)
      throw new Exception('Integração não autorizada.', { status: 403 })
    return connection
  }

  async claims(connection: HeadlessConnection, assertion: string) {
    try {
      const decoded = jwt.verify(assertion, connection.public_key, {
        algorithms: ['RS256'],
        issuer: connection.issuer,
        audience: 'telemed:doctor-action',
      })
      const claims = await claimsValidator.validate(decoded)
      const now = Math.floor(Date.now() / 1000)
      if (
        claims.exp <= now ||
        claims.iat > now + 5 ||
        claims.iat < now - 60 ||
        claims.exp <= claims.iat ||
        claims.exp - claims.iat > 60
      )
        throw new Error('Invalid assertion lifetime')
      return claims
    } catch {
      throw new Exception('Asserção médica inválida ou expirada.', { status: 401 })
    }
  }

  async authorize(
    connection: HeadlessConnection,
    claims: DoctorClaims,
    c: Consultation,
    action: DoctorClaims['action'],
    trx: TransactionClientContract
  ) {
    // Recheck the connection and mapped clinician inside the same consultation transaction.
    const current = await this.repository.connection(c.tenant_id, trx)
    if (
      !current?.active ||
      current.id !== connection.id ||
      current.public_key !== connection.public_key ||
      current.issuer !== connection.issuer ||
      current.service_user_id !== connection.service_user_id
    )
      throw new Exception('Integração não autorizada.', { status: 403 })
    if (
      claims.consultation_id !== c.id ||
      claims.action !== action ||
      c.tenant_id !== connection.tenant_id
    )
      throw new Exception('Asserção fora do escopo da consulta.', { status: 403 })
    if (claims.exp <= Math.floor(Date.now() / 1000))
      throw new Exception('Asserção expirada.', { status: 401 })
    const doctor = await trx
      .from('headless_identities as i')
      .join('professionals as p', 'p.id', 'i.professional_id')
      .join('users as u', 'u.id', 'p.user_id')
      .join('user_tenants as m', function () {
        this.on('m.user_id', '=', 'u.id').andOn('m.tenant_id', '=', 'p.tenant_id')
      })
      .where('i.connection_id', connection.id)
      .where('i.subject', claims.sub)
      .where('p.tenant_id', c.tenant_id)
      .where('p.id', c.professional_id)
      .where('u.is_deleted', false)
      .select('u.id', 'u.full_name')
      .first()
    if (!doctor || doctor.id === connection.service_user_id)
      throw new Exception('Somente o médico responsável pode atender.', { status: 403 })
    const roles = await trx
      .from('user_roles as ur')
      .join('roles as r', 'r.id', 'ur.role_id')
      .where('ur.user_id', doctor.id)
      .select('r.slug')
    if (!roles.some((r) => r.slug === 'doctor') || roles.some((r) => r.slug === 'root'))
      throw new Exception('Identidade médica não autorizada.', { status: 403 })
    const attendance = await trx
      .from('role_permissions as rp')
      .join('roles as r', 'r.id', 'rp.role_id')
      .join('permissions as p', 'p.id', 'rp.permission_id')
      .where('r.slug', 'doctor')
      .where('p.resource', 'consultations')
      .where('p.action', 'attend')
      .whereIn('p.context', ['own', 'any'])
      .first()
    if (!attendance) throw new Exception('Médico sem permissão de atendimento.', { status: 403 })
    if (
      !(await this.repository.consume(connection.id, claims.jti, new Date(claims.exp * 1000), trx))
    )
      throw new Exception('Asserção já utilizada.', { status: 401 })
    return {
      userId: Number(doctor.id),
      name: String(doctor.full_name),
      externalSubject: claims.sub,
    }
  }
}
