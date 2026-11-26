import { test } from '@japa/runner'
import env from '#start/env'

test.group('Telemed product boundaries', () => {
  test('registration is closed when workspace mode is none', async ({ client }) => {
    const previous = env.get('REGISTRATION_WORKSPACE_MODE')
    env.set('REGISTRATION_WORKSPACE_MODE', 'none')
    try {
      const page = await client.get('/register')
      page.assertStatus(404)
      const api = await client.post('/api/v1/sessions/sign-up').json({})
      api.assertStatus(404)
    } finally {
      env.set('REGISTRATION_WORKSPACE_MODE', previous)
    }
  })

  test('platform patient entry is available without authentication', async ({ client }) => {
    const response = await client.get('/c')
    response.assertStatus(200)
  })

  test('LiveKit rejects invalid signatures', async ({ client }) => {
    const response = await client
      .post('/webhooks/livekit')
      .header('authorization', 'invalid')
      .json({ event: 'room_finished' })
    response.assertStatus(401)
  })
})
