import { inject } from '@adonisjs/core'
import { HttpContext } from '@adonisjs/core/http'
import PublicClinicService, { publicClinic } from '#modules/tenants/services/public_clinic_service'
import PatientService from '#modules/consultations/services/patient_service'
import {
  patientConsentValidator,
  patientSessionValidator,
} from '#modules/consultations/validators/consultation_validator'

@inject()
export default class PatientController {
  constructor(
    private clinics: PublicClinicService,
    private patients: PatientService
  ) {}
  async page(ctx: HttpContext) {
    const clinic = await this.clinics.resolve(ctx)
    return ctx.inertia.render('telemed/patient', { clinic: clinic ? publicClinic(clinic) : null })
  }
  async exchange(ctx: HttpContext) {
    const { secret } = await ctx.request.validateUsing(patientSessionValidator)
    return this.patients.exchange(ctx, secret)
  }
  async state(ctx: HttpContext) {
    const { c, link } = await this.patients.session(ctx)
    return this.patients.state(ctx, c, link)
  }
  async consent(ctx: HttpContext) {
    return this.patients.accept(ctx, await ctx.request.validateUsing(patientConsentValidator))
  }
  async token(ctx: HttpContext) {
    return this.patients.token(ctx)
  }
  async decline(ctx: HttpContext) {
    return this.patients.decline(ctx)
  }
}
