import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { Exception } from '@adonisjs/core/exceptions'
import Consultation from '#modules/consultations/models/consultation'
import Consent from '#modules/consents/models/consent'
import { AccessToken, RoomServiceClient, ServerError, WebhookReceiver } from 'livekit-server-sdk'
import env from '#start/env'

export default class VideoService {
  readonly rooms = new RoomServiceClient(
    env.get('LIVEKIT_URL').replace(/^ws/, 'http'),
    env.get('LIVEKIT_API_KEY'),
    env.get('LIVEKIT_API_SECRET')
  )
  readonly receiver = new WebhookReceiver(env.get('LIVEKIT_API_KEY'), env.get('LIVEKIT_API_SECRET'))

  roomName(tenantId: number, consultationId: number) {
    return `t${tenantId}-${consultationId}`
  }

  async token(
    tenantId: number,
    consultationId: number,
    role: 'doctor' | 'patient',
    name: string,
    authorize?: (consultation: Consultation, trx: TransactionClientContract) => Promise<unknown>
  ) {
    return db.transaction(async (trx) => {
      const consultation = await Consultation.query({ client: trx })
        .where('tenant_id', tenantId)
        .where('id', consultationId)
        .forUpdate()
        .firstOrFail()
      if (
        consultation.status !== 'in_progress' ||
        !consultation.admitted_at ||
        !(await Consent.query({ client: trx }).where('consultation_id', consultationId).first())
      )
        throw new Exception('A consulta ainda não foi admitida ou já foi encerrada.', {
          status: 409,
        })
      if (authorize) await authorize(consultation, trx)
      const room = this.roomName(tenantId, consultationId)
      await this.rooms.createRoom({
        name: room,
        maxParticipants: 2,
        emptyTimeout: 600,
        departureTimeout: 120,
      })
      const token = new AccessToken(env.get('LIVEKIT_API_KEY'), env.get('LIVEKIT_API_SECRET'), {
        identity: `${role}-${consultationId}`,
        name: name.trim().split(/\s+/)[0],
        metadata: JSON.stringify({ role }),
        ttl: '60s',
      })
      token.addGrant({
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      })
      return { token: await token.toJwt(), url: env.get('LIVEKIT_URL') }
    })
  }

  async close(
    tenantId: number,
    consultationId: number,
    mode: 'cloud' | 'self_hosted' = env.get('LIVEKIT_REVOCATION_MODE', 'self_hosted')
  ) {
    const name = this.roomName(tenantId, consultationId)
    if (mode === 'cloud') {
      // Explicit cutoff also revokes absent participants. Never skip these calls based on
      // room/participant listings: a disconnected client can still hold a refreshed token.
      for (const role of ['doctor', 'patient']) {
        await this.rooms.removeParticipant(name, `${role}-${consultationId}`, {
          revokeTokenTs: BigInt(Math.floor(Date.now() / 1000) + 1),
        })
      }
    }
    try {
      await this.rooms.deleteRoom(name)
    } catch (error) {
      // An explicit provider response confirming absence is idempotent success.
      if (!(error instanceof ServerError) || error.code !== 'not_found') throw error
    }
  }
}
