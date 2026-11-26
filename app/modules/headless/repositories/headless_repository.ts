import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export type HeadlessConnection = {
  id: number
  tenant_id: number
  service_user_id: number
  issuer: string
  public_key: string
  patient_url: string
  active: boolean
}
export default class HeadlessRepository {
  connection(
    tenantId: number,
    trx?: TransactionClientContract
  ): Promise<HeadlessConnection | null> {
    return (trx ?? db).from('headless_connections').where('tenant_id', tenantId).first()
  }
  async consume(
    connectionId: number,
    nonce: string,
    expiresAt: Date,
    trx: TransactionClientContract
  ) {
    const rows = await trx
      .table('headless_nonces')
      .insert({ connection_id: connectionId, nonce, expires_at: expiresAt })
      .onConflict(['connection_id', 'nonce'])
      .ignore()
      .returning('nonce')
    return rows.length === 1
  }
}
