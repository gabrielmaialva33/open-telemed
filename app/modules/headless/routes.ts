import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { consultationThrottle } from '#start/limiter'
const Patient = () => import('#modules/headless/controllers/headless_patient_controller')
const Doctor = () => import('#modules/headless/controllers/headless_doctor_controller')
router
  .group(() => {
    router.post('/patient/session', [Patient, 'exchange']).as('headless.patient.exchange')
    router.post('/patient/state', [Patient, 'state']).as('headless.patient.state')
    router.post('/patient/consent', [Patient, 'consent']).as('headless.patient.consent')
    router.post('/patient/video-token', [Patient, 'token']).as('headless.patient.token')
    router.post('/patient/decline', [Patient, 'decline']).as('headless.patient.decline')
    for (const action of ['state', 'admit', 'video-token', 'end']) {
      router
        .post(`/doctor/:id/${action}`, [Doctor, 'handle'])
        .as(`headless.doctor.${action}`)
        .where('id', /^\d+$/)
    }
  })
  .prefix('/api/v1/headless')
  .use([
    async ({ response }, next) => {
      response.header('Cache-Control', 'no-store, private')
      response.header('Referrer-Policy', 'no-referrer')
      return next()
    },
    middleware.auth({ guards: ['api'] }),
    middleware.tenant({ required: true }),
    consultationThrottle,
  ])
