import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import ConsultationService from '#modules/consultations/services/consultation_service'
import ConsultationAccessService from '#modules/consultations/services/consultation_access_service'
import PermissionService from '#modules/permissions/services/permission_service'
import type Consultation from '#modules/consultations/models/consultation'

@inject()
export default class GetConsultationOverviewService {
  constructor(
    private consultations: ConsultationService,
    private access: ConsultationAccessService,
    private permissions: PermissionService
  ) {}

  async run(ctx: HttpContext) {
    const now = DateTime.now().setZone('America/Sao_Paulo')
    const empty = {
      today: [],
      waiting: [],
      upcoming: [],
      canManage: false,
      available: false,
      date: now.toFormat('dd/MM/yyyy'),
    }
    if (
      !ctx.tenant ||
      !(await this.permissions.checkUserPermission({
        user_id: ctx.auth.getUserOrFail().id,
        permission: 'consultations.list',
      }))
    )
      return empty
    const { query } = await this.consultations.visibleQuery(ctx)
    const start = now.startOf('day')
    const end = start.plus({ days: 1 })
    const [today, waiting, upcoming] = await Promise.all([
      query
        .clone()
        .where('scheduled_at', '>=', start.toUTC().toSQL()!)
        .where('scheduled_at', '<', end.toUTC().toSQL()!)
        .orderBy('scheduled_at'),
      query.clone().where('status', 'waiting').orderBy('scheduled_at'),
      query
        .clone()
        .where('status', 'scheduled')
        .where('scheduled_at', '>=', end.toUTC().toSQL()!)
        .orderBy('scheduled_at')
        .limit(6),
    ])
    const attendingIds = await this.access.attendingProfessionalIds(ctx)
    const present = (items: Consultation[]) =>
      items.map((c) => ({
        id: c.id,
        patient_name: c.patient_name,
        patient_location: c.patient_location,
        scheduled_at: c.scheduled_at.toISO(),
        status: c.status,
        outcome: c.outcome,
        canAttend: attendingIds.has(c.professional_id),
      }))
    return {
      today: present(today),
      waiting: present(waiting),
      upcoming: present(upcoming),
      canManage: await this.access.isManager(ctx),
      available: true,
      date: empty.date,
    }
  }
}
