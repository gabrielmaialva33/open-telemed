import Consultation from '#modules/consultations/models/consultation'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export default class ConsultationRepository {
  query(tenantId: number, trx?: TransactionClientContract) {
    return Consultation.query(trx ? { client: trx } : {}).where('tenant_id', tenantId)
  }

  async find(tenantId: number, id: number, trx?: TransactionClientContract) {
    const query = this.query(tenantId, trx).where('id', id)
    if (trx) query.forUpdate()
    return query.firstOrFail()
  }
}
