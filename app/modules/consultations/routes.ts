import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { consultationThrottle, patientThrottle, patientLinkThrottle } from '#start/limiter'

const Consultations = () => import('#modules/consultations/controllers/consultations_controller')
const Patient = () => import('#modules/consultations/controllers/patient_controller')
const Webhook = () => import('#modules/consultations/controllers/livekit_webhook_controller')

router
  .group(() => {
    router.post('/', [Consultations, 'store']).as('api.consultations.store')
    router
      .patch('/:id', [Consultations, 'update'])
      .as('api.consultations.update')
      .where('id', /^\d+$/)
    router
      .post('/:id/patient-link', [Consultations, 'link'])
      .as('api.consultations.patient_link')
      .where('id', /^\d+$/)
    router.get('/:id', [Consultations, 'show']).as('api.consultations.show').where('id', /^\d+$/)
    router
      .post('/:id/cancel', [Consultations, 'cancel'])
      .as('api.consultations.cancel')
      .where('id', /^\d+$/)
    router
      .get('/:id/audit', [Consultations, 'audit'])
      .as('api.consultations.audit')
      .where('id', /^\d+$/)
  })
  .prefix('/api/v1/consultations')
  .use([
    middleware.auth({ guards: ['api'] }),
    middleware.tenant({ required: true }),
    consultationThrottle,
  ])

router
  .group(() => {
    router.get('/', [Consultations, 'index']).as('consultations.index')
    router.post('/', [Consultations, 'store']).as('consultations.store')
    router.get('/:id', [Consultations, 'show']).as('consultations.show').where('id', /^\d+$/)
    router.get('/:id/room', [Consultations, 'show']).as('consultations.room').where('id', /^\d+$/)
    router
      .post('/:id/patient-link', [Consultations, 'link'])
      .as('consultations.patient_link')
      .where('id', /^\d+$/)
    router
      .post('/:id/admit', [Consultations, 'admit'])
      .as('consultations.admit')
      .where('id', /^\d+$/)
    router
      .post('/:id/video-token', [Consultations, 'token'])
      .as('consultations.token')
      .where('id', /^\d+$/)
    router.post('/:id/end', [Consultations, 'end']).as('consultations.end').where('id', /^\d+$/)
    router
      .post('/:id/cancel', [Consultations, 'cancel'])
      .as('consultations.cancel')
      .where('id', /^\d+$/)
  })
  .prefix('/consultations')
  .use([middleware.auth({ guards: ['jwt'] }), middleware.tenant({ required: true })])

const privateResponse = async (
  { response }: import('@adonisjs/core/http').HttpContext,
  next: import('@adonisjs/core/types/http').NextFn
) => {
  response.header('Cache-Control', 'no-store, private')
  response.header('Referrer-Policy', 'no-referrer')
  return next()
}
router.get('/c', [Patient, 'page']).as('patient.page').use(privateResponse)
router.get('/t/:slug/c', [Patient, 'page']).as('patient.development_page').use(privateResponse)
router
  .group(() => {
    router.post('/session', [Patient, 'exchange']).use(patientLinkThrottle).as('patient.exchange')
    router.get('/state', [Patient, 'state']).as('patient.state')
    router.post('/consent', [Patient, 'consent']).as('patient.consent')
    router.post('/video-token', [Patient, 'token']).as('patient.token')
    router.post('/decline', [Patient, 'decline']).as('patient.decline')
  })
  .prefix('/patient')
  .use([privateResponse, patientThrottle])
router.post('/webhooks/livekit', [Webhook, 'handle']).as('livekit.webhook')

router
  .group(() => {
    router
      .post('/session', [Patient, 'exchange'])
      .use(patientLinkThrottle)
      .as('patient.development_exchange')
    router.get('/state', [Patient, 'state']).as('patient.development_state')
    router.post('/consent', [Patient, 'consent']).as('patient.development_consent')
    router.post('/video-token', [Patient, 'token']).as('patient.development_token')
    router.post('/decline', [Patient, 'decline']).as('patient.development_decline')
  })
  .prefix('/t/:slug/patient')
  .use([privateResponse, patientThrottle])
