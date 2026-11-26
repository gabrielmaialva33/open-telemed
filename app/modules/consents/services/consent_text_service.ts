import { createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import ConsentText from '#modules/consents/models/consent_text'

export const defaultConsentText = `TERMO DE CONSENTIMENTO PARA TELECONSULTA
Autorizo expressamente o teleatendimento e a transmissão eletrônica de minhas imagens, voz e dados de saúde necessários ao atendimento, conforme o art. 15 da Resolução CFM nº 2.314/2022. Entendo que esses dados poderão ser compartilhados com a equipe assistencial e com o sistema de prontuário da clínica, sob sigilo e para a finalidade do cuidado.
Fui informado de que a teleconsulta tem limitações: não permite exame físico completo. O médico pode recomendar atendimento presencial. Posso recusar ou interromper a teleconsulta a qualquer momento e optar pelo atendimento presencial, sem perder esse direito.
A consulta não será gravada. Uma eventual autorização de gravação é separada e opcional; nesta versão da plataforma não há gravação, mesmo se eu manifestar essa preferência.
Confirmo que informei corretamente o local onde estou recebendo o atendimento. Se atuar como representante legal, informarei meus dados. O aceite, a versão deste termo, a data, o IP e o navegador serão registrados para comprovar minha decisão.`

export default class ConsentTextService {
  async current(tenantId: number) {
    return ConsentText.query().where('tenant_id', tenantId).orderBy('version', 'desc').firstOrFail()
  }

  async publish(tenantId: number, body: string) {
    return db.transaction(async (trx) => {
      await trx.from('tenants').where('id', tenantId).forUpdate().firstOrFail()
      const last = await ConsentText.query({ client: trx })
        .where('tenant_id', tenantId)
        .orderBy('version', 'desc')
        .first()
      return ConsentText.create(
        {
          tenant_id: tenantId,
          version: (last?.version ?? 0) + 1,
          body,
          hash: createHash('sha256').update(body).digest('hex'),
        },
        { client: trx }
      )
    })
  }
}
