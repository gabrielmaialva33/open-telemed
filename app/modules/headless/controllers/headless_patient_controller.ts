import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import HeadlessAccessService from '#modules/headless/services/headless_access_service'
import PatientService, {
  type PatientTransport,
} from '#modules/consultations/services/patient_service'
import {
  patientSessionValidator,
  patientConsentValidator,
} from '#modules/consultations/validators/consultation_validator'
import { patientEvidenceValidator } from '#modules/headless/validators/headless_validator'

@inject()
export default class HeadlessPatientController {
  constructor(
    private access: HeadlessAccessService,
    private patients: PatientService
  ) {}
  private async transport(ctx: HttpContext): Promise<PatientTransport> {
    const connection = await this.access.connection(ctx, 'patient')
    const sessionSecret = ctx.request.header('x-patient-session')
    if (sessionSecret && !/^[A-Za-z0-9_-]{32,128}$/.test(sessionSecret))
      throw new Exception('Sessão inválida.', { status: 401 })
    return { tenantId: connection.tenant_id, sessionSecret }
  }
  async exchange(ctx: HttpContext) {
    const transport = await this.transport(ctx)
    const { secret } = await ctx.request.validateUsing(patientSessionValidator)
    return this.patients.exchange(ctx, secret, transport)
  }
  async state(ctx: HttpContext) {
    const transport = await this.transport(ctx)
    const { c, link } = await this.patients.session(ctx, transport)
    return this.patients.state(ctx, c, link, transport)
  }
  async consent(ctx: HttpContext) {
    const transport = await this.transport(ctx)
    const evidence = await ctx.request.validateUsing(patientEvidenceValidator)
    const payload = await ctx.request.validateUsing(patientConsentValidator)
    return this.patients.accept(ctx, payload, {
      ...transport,
      clientIp: evidence.client_ip,
      clientUserAgent: evidence.client_user_agent,
    })
  }
  async token(ctx: HttpContext) {
    return this.patients.token(ctx, await this.transport(ctx))
  }
  async decline(ctx: HttpContext) {
    return this.patients.decline(ctx, await this.transport(ctx))
  }
}
