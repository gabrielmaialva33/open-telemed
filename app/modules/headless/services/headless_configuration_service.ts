import { createPublicKey } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import vine from '@vinejs/vine'
import env from '#start/env'

const connectionValidator = vine.compile(
  vine.object({
    tenantId: vine.number().positive().withoutDecimals(),
    serviceUserId: vine.number().positive().withoutDecimals(),
    issuer: vine.string().trim().minLength(1).maxLength(200),
    publicKey: vine.string().maxLength(8192),
    patientUrl: vine.string().url().maxLength(500),
  })
)
const mappingValidator = vine.compile(
  vine.object({
    tenantId: vine.number().positive().withoutDecimals(),
    professionalId: vine.number().positive().withoutDecimals(),
    subject: vine.string().trim().minLength(1).maxLength(128),
  })
)
export default class HeadlessConfigurationService {
  async configure(input: unknown) {
    const data = await connectionValidator.validate(input)
    let key
    try {
      key = createPublicKey(data.publicKey)
    } catch {
      throw new Exception('Chave pública inválida.', { status: 422 })
    }
    if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048)
      throw new Exception('Use chave pública RSA de pelo menos 2048 bits.', { status: 422 })
    const url = new URL(data.patientUrl)
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      !['https:', 'http:'].includes(url.protocol) ||
      (env.get('NODE_ENV') === 'production' && url.protocol !== 'https:')
    )
      throw new Exception('URL pública inválida.', { status: 422 })
    await db.transaction(async (trx) => {
      await trx
        .from('tenants')
        .where('id', data.tenantId)
        .where('is_active', true)
        .forUpdate()
        .firstOrFail()
      await trx
        .from('users')
        .where('id', data.serviceUserId)
        .where('is_deleted', false)
        .firstOrFail()
      const memberships = await trx
        .from('user_tenants')
        .where('user_id', data.serviceUserId)
        .select('tenant_id')
      if (memberships.length !== 1 || Number(memberships[0].tenant_id) !== data.tenantId)
        throw new Exception('Usuário de serviço precisa de vínculo exclusivo com a clínica.', {
          status: 422,
        })
      if (await trx.from('professionals').where('user_id', data.serviceUserId).first())
        throw new Exception('Separe a identidade de serviço da identidade médica.', { status: 422 })
      const existing = await trx
        .from('headless_connections')
        .where('tenant_id', data.tenantId)
        .forUpdate()
        .first()
      if (
        existing &&
        existing.issuer !== data.issuer &&
        (await trx.from('headless_identities').where('connection_id', existing.id).first())
      )
        throw new Exception('Remova os mapeamentos antes de trocar o emissor.', { status: 422 })
      await trx
        .table('headless_connections')
        .insert({
          tenant_id: data.tenantId,
          service_user_id: data.serviceUserId,
          issuer: data.issuer,
          public_key: key.export({ type: 'spki', format: 'pem' }),
          patient_url: url.toString(),
          active: true,
        })
        .onConflict('tenant_id')
        .merge()
    })
  }
  async mapDoctor(input: unknown) {
    const data = await mappingValidator.validate(input)
    await db.transaction(async (trx) => {
      const connection = await trx
        .from('headless_connections')
        .where('tenant_id', data.tenantId)
        .where('active', true)
        .forUpdate()
        .firstOrFail()
      const doctor = await trx
        .from('professionals as p')
        .join('users as u', 'u.id', 'p.user_id')
        .join('user_tenants as m', function () {
          this.on('m.user_id', '=', 'u.id').andOn('m.tenant_id', '=', 'p.tenant_id')
        })
        .where('p.tenant_id', data.tenantId)
        .where('p.id', data.professionalId)
        .where('u.is_deleted', false)
        .select('u.id')
        .firstOrFail()
      const roles = await trx
        .from('user_roles as ur')
        .join('roles as r', 'r.id', 'ur.role_id')
        .where('ur.user_id', doctor.id)
        .select('r.slug')
      if (
        doctor.id === connection.service_user_id ||
        !roles.some((r) => r.slug === 'doctor') ||
        roles.some((r) => r.slug === 'root')
      )
        throw new Exception('Somente identidade médica verificada pode ser mapeada.', {
          status: 422,
        })
      await trx
        .table('headless_identities')
        .insert({
          connection_id: connection.id,
          subject: data.subject,
          professional_id: data.professionalId,
        })
        .onConflict(['connection_id', 'professional_id'])
        .merge()
    })
  }
}
