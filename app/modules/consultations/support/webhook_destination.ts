import { Exception } from '@adonisjs/core/exceptions'
import env from '#start/env'

/** Only the deployment operator can authorize an integration origin, never a clinic user. */
export function assertWebhookDestination(value: string) {
  const url = new URL(value)
  const allowed = (env.get('WEBHOOK_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (
    !allowed.includes(url.origin) ||
    url.username ||
    url.password ||
    url.hash ||
    !['https:', 'http:'].includes(url.protocol) ||
    (env.get('NODE_ENV') === 'production' && url.protocol !== 'https:')
  )
    throw new Exception('Destino de webhook não autorizado pela plataforma.', { status: 422 })
}
