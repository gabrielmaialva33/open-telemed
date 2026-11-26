import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { Exception } from '@adonisjs/core/exceptions'

/** Clinical exports still reference this identity. Account removal needs a retention workflow. */
export async function preserveProfessionalIdentity(userId: number, trx: TransactionClientContract) {
  if (await trx.from('professionals').where('user_id', userId).first())
    throw new Exception(
      'A conta possui vínculo profissional e deve preservar sua identidade clínica.',
      { status: 409 }
    )
}
