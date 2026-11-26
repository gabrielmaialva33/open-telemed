import { BaseSeeder } from '@adonisjs/lucid/seeders'
import app from '@adonisjs/core/services/app'
import { DateTime } from 'luxon'
import Tenant from '#modules/tenants/models/tenant'
import User from '#modules/users/models/user'
import Role from '#modules/roles/models/role'
import Professional from '#modules/professionals/models/professional'
import Consultation from '#modules/consultations/models/consultation'
import ConsentText from '#modules/consents/models/consent_text'
import ConsentTextService, {
  defaultConsentText,
} from '#modules/consents/services/consent_text_service'
import ConsultationService from '#modules/consultations/services/consultation_service'

export default class extends BaseSeeder {
  static environment = ['development']
  async run() {
    const terms = new ConsentTextService()
    const consultations = await app.container.make(ConsultationService)
    for (const [index, brand] of [
      {
        slug: 'aurora',
        name: 'Clínica Aurora',
        primary: '#0f766e',
        accent: '#d1fae5',
        doctor: 'Ana Martins',
      },
      {
        slug: 'horizonte',
        name: 'Clínica Horizonte',
        primary: '#6d48a5',
        accent: '#ede4fa',
        doctor: 'Bruno Lima',
      },
    ].entries()) {
      const tenant = await Tenant.firstOrCreate(
        { slug: brand.slug },
        {
          name: brand.name,
          slug: brand.slug,
          is_active: true,
          primary_color: brand.primary,
          accent_color: brand.accent,
          custom_hosts: [],
          legal_name: `${brand.name} Demonstração Ltda.`,
          cnpj: index ? '00.000.000/0002-00' : '00.000.000/0001-00',
          crm_pj: `${1000 + index}`,
          crm_pj_uf: 'SP',
          technical_director_name: brand.doctor,
          technical_director_crm: `${123456 + index}`,
          technical_director_uf: 'SP',
        }
      )
      if (!(await ConsentText.query().where('tenant_id', tenant.id).first()))
        await terms.publish(tenant.id, defaultConsentText)
      let doctorId = 0
      for (const [kind, roleSlug, fullName] of [
        ['admin', 'clinic_owner', `Admin ${brand.name}`],
        ['medico', 'doctor', brand.doctor],
        ['integrador', 'integrator', `Integração ${brand.name}`],
      ]) {
        const email = `${kind}@${brand.slug}.example.test`
        const user = await User.firstOrCreate(
          { email },
          {
            email,
            full_name: fullName,
            password: 'TelemedDemo2026!',
            metadata: {
              email_verified: true,
              email_verified_at: DateTime.utc().toISO(),
              email_verification_sent_at: null,
              email_verification_token_hash: null,
            },
          }
        )
        await user
          .related('tenants')
          .sync({ [tenant.id]: { role: kind === 'admin' ? 'owner' : 'member' } }, false)
        const role = await Role.findByOrFail('slug', roleSlug)
        await user.related('roles').sync([role.id], false)
        if (kind === 'medico') doctorId = user.id
        console.log(`[DEV ${brand.slug}] ${kind}: ${email} / TelemedDemo2026!`)
        if (kind === 'integrador') {
          const token = await User.accessTokens.create(
            user,
            [
              'consultations.create',
              'consultations.update',
              'consultations.link',
              'professionals.read',
              'consultations.read',
              'consultations.cancel',
              'consultations.audit',
            ],
            { name: 'demo-integration', expiresIn: '7 days' }
          )
          console.log(`[DEV ${brand.slug}] API token (7 dias): ${token.value!.release()}`)
        }
      }
      const professional = await Professional.firstOrCreate(
        { tenant_id: tenant.id, user_id: doctorId },
        {
          tenant_id: tenant.id,
          user_id: doctorId,
          crm: `${123456 + index}`,
          crm_uf: 'SP',
          rqe: null,
        }
      )
      const c = await Consultation.firstOrCreate(
        { tenant_id: tenant.id, external_id: 'demo-001' },
        {
          tenant_id: tenant.id,
          professional_id: professional.id,
          external_id: 'demo-001',
          patient_name: index ? 'Rafael Exemplo' : 'Marina Exemplo',
          patient_location: 'São Paulo/SP',
          scheduled_at: DateTime.now().plus({ hours: 1 }),
          retain_until: DateTime.now().plus({ years: 20 }),
          status: 'scheduled',
        }
      )
      await c.refresh()
      if (!['ended', 'cancelled'].includes(c.status))
        console.log(`[DEV ${brand.slug}] Paciente: ${await consultations.link(c)}`)
      console.log(`[DEV ${brand.slug}] Médico: /consultations/${c.id}/room`)
    }
    console.log('Dados fictícios para desenvolvimento. Não usar estas credenciais em produção.')
  }
}
