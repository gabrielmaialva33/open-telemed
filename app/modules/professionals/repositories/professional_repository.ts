import db from '@adonisjs/lucid/services/db'

export type ProfessionalSummary = {
  id: number
  user_id: number
  crm: string
  crm_uf: string
  rqe: string | null
  full_name: string
}

export default class ProfessionalRepository {
  async list(
    tenantId: number,
    filter: { crm?: string; crm_uf?: string } = {}
  ): Promise<ProfessionalSummary[]> {
    const query = db
      .from('professionals as p')
      .join('users as u', 'u.id', 'p.user_id')
      .where('p.tenant_id', tenantId)
      .where('u.is_deleted', false)
      .select('p.id', 'p.user_id', 'p.crm', 'p.crm_uf', 'p.rqe', 'u.full_name')
      .orderBy('u.full_name')
    if (filter.crm) query.where('p.crm', filter.crm)
    if (filter.crm_uf) query.where('p.crm_uf', filter.crm_uf)
    return query
  }
}
