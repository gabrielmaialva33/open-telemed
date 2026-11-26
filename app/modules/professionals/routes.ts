import { consultationThrottle } from '#start/limiter'
import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
const Clinic = () => import('#modules/professionals/controllers/clinic_controller')
router
  .group(() => {
    router.get('/professionals', [Clinic, 'professionalsPage']).as('professionals.index')
    router.post('/professionals', [Clinic, 'saveProfessional']).as('professionals.store')
    router
      .put('/professionals/:id', [Clinic, 'saveProfessional'])
      .as('professionals.update')
      .where('id', /^\d+$/)
    router.get('/clinic', [Clinic, 'settings']).as('clinic.settings')
    router.put('/clinic', [Clinic, 'saveSettings']).as('clinic.update')
    router.post('/clinic/consent-texts', [Clinic, 'publishTerm']).as('clinic.publish_term')
  })
  .use([middleware.auth({ guards: ['jwt'] }), middleware.tenant({ required: true })])

router
  .get('/api/v1/professionals', [Clinic, 'apiIndex'])
  .as('api.professionals.index')
  .use([
    middleware.auth({ guards: ['api'] }),
    middleware.tenant({ required: true }),
    consultationThrottle,
  ])
