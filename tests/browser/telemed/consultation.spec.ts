/// <reference lib="dom" />
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import { DateTime } from 'luxon'
import type { Page } from 'playwright'
import Tenant from '#modules/tenants/models/tenant'
import User from '#modules/users/models/user'
import Role from '#modules/roles/models/role'
import Professional from '#modules/professionals/models/professional'
import Consultation from '#modules/consultations/models/consultation'
import ConsultationService from '#modules/consultations/services/consultation_service'
import ConsentTextService, {
  defaultConsentText,
} from '#modules/consents/services/consent_text_service'
import VideoService from '#shared/services/video_service'
import env from '#start/env'

async function clinic(slug: string, name: string, color: string, accent: string) {
  const tenant = await Tenant.create({
    name,
    slug,
    is_active: true,
    primary_color: color,
    accent_color: accent,
    custom_hosts: [],
    legal_name: `${name} Demonstração Ltda.`,
    cnpj: '00.000.000/0001-00',
    crm_pj: '1000',
    crm_pj_uf: 'SP',
    technical_director_name: 'Ana Martins',
    technical_director_crm: '123456',
    technical_director_uf: 'SP',
  })
  const user = await User.create({
    email: `${slug}@example.test`,
    full_name: 'Ana Martins',
    password: 'TelemedBrowser2026!',
  })
  await user.related('tenants').attach({ [tenant.id]: { role: 'member' } })
  const role = await Role.findByOrFail('slug', 'doctor')
  await user.related('roles').attach([role.id])
  const professional = await Professional.create({
    tenant_id: tenant.id,
    user_id: user.id,
    crm: '123456',
    crm_uf: 'SP',
  })
  await new ConsentTextService().publish(tenant.id, defaultConsentText)
  const consultation = await Consultation.create({
    tenant_id: tenant.id,
    professional_id: professional.id,
    patient_name: 'Marina Exemplo',
    patient_location: 'São Paulo/SP',
    scheduled_at: DateTime.utc(),
    retain_until: DateTime.utc().plus({ years: 20 }),
    status: 'scheduled',
  })
  const service = await app.container.make(ConsultationService)
  const url = await service.link(consultation)
  return { tenant, user, consultation, url }
}

test.group('Telemed browser acceptance', () => {
  test('two tabs retain their own consultation after reload', async ({
    browserContext,
    assert,
  }) => {
    const a = await clinic('tabs-aurora', 'Tabs Aurora', '#0f766e', '#d1fae5')
    const b = await clinic('tabs-horizonte', 'Tabs Horizonte', '#6d48a5', '#ede4fa')
    const one = await browserContext.newPage()
    const two = await browserContext.newPage()
    await one.goto(a.url)
    await one.getByText('Olá, Marina.').waitFor()
    await two.goto(b.url)
    await two.getByText('Olá, Marina.').waitFor()
    await one.reload()
    await one.getByText('Olá, Marina.').waitFor()
    assert.equal(new URL(one.url()).searchParams.get('consultation_id'), String(a.consultation.id))
    assert.equal(new URL(two.url()).searchParams.get('consultation_id'), String(b.consultation.id))
    const cookies = await browserContext.cookies()
    assert.includeMembers(
      cookies.map((cookie) => cookie.name),
      [`telemed_patient_${a.consultation.id}`, `telemed_patient_${b.consultation.id}`]
    )
    await one.close()
    await two.close()
  })

  test('patient consents, waits, is admitted, exchanges real video and sees clinic branding at both widths', async ({
    browserContext,
    assert,
    cleanup,
  }) => {
    const screenshotDir = process.env.TELEMED_SCREENSHOT_DIR || app.tmpPath('telemed-browser')
    await mkdir(screenshotDir, { recursive: true })
    const origin = `http://${env.get('HOST')}:${env.get('PORT')}`
    await browserContext.grantPermissions(['camera', 'microphone'])
    const doctorContext = await browserContext.browser()!.newContext({
      baseURL: origin,
      permissions: ['camera', 'microphone'],
      viewport: { width: 1280, height: 900 },
    })
    cleanup(() => doctorContext.close())
    const patient = await browserContext.newPage()
    const doctor = await doctorContext.newPage()
    const errors: string[] = []
    for (const page of [patient, doctor])
      page.on('pageerror', (error) => errors.push(error.message))
    const a = await clinic('browser-aurora', 'Clínica Aurora', '#0f766e', '#d1fae5')
    const b = await clinic('browser-horizonte', 'Clínica Horizonte', '#6d48a5', '#ede4fa')
    const video = new VideoService()
    cleanup(() => video.close(a.tenant.id, a.consultation.id))
    async function capture(page: Page, name: string, width: number) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({
        path: join(screenshotDir, `${name}-${width}.png`),
        fullPage: true,
        animations: 'disabled',
      })
      if (name.includes('video')) {
        const controlsFit = await page.locator('.video-room').evaluate((room) => {
          const bounds = room.getBoundingClientRect()
          const controls = [...room.querySelectorAll('button')]
          return (
            controls.length === 3 &&
            controls.every((control) => {
              const rect = control.getBoundingClientRect()
              return (
                rect.width > 0 &&
                rect.left >= bounds.left &&
                rect.right <= bounds.right &&
                rect.bottom <= bounds.bottom
              )
            })
          )
        })
        assert.isTrue(controlsFit, 'Camera, microphone and leave controls must not be clipped')
      }
      assert.isAtMost(
        await page.evaluate(() => document.documentElement.scrollWidth),
        width,
        'No horizontal overflow'
      )
      if (await page.locator('.demo1').count()) {
        assert.isTrue(
          await page.evaluate(() => {
            const header = document.querySelector('.demo1 .header')!.getBoundingClientRect()
            const main = document.querySelector('.demo1 main')!.getBoundingClientRect()
            return main.top + window.scrollY >= header.height
          }),
          'The fixed header must not cover the page content'
        )
      }
    }
    await patient.goto(a.url)
    await patient.getByRole('button', { name: 'Testar câmera e microfone' }).click()
    await patient.getByText('Câmera e microfone autorizados').waitFor()
    await patient.getByRole('button', { name: 'Continuar para o termo' }).click()
    await patient.getByRole('checkbox', { name: /Li e aceito/ }).waitFor()
    assert.equal(new URL(patient.url()).hash, '')
    assert.isFalse(
      await patient.getByRole('checkbox', { name: /Autorizaria gravação/ }).isChecked()
    )
    for (const width of [1280, 390]) await capture(patient, 'aurora-consent', width)
    await patient.getByRole('checkbox', { name: /Li e aceito/ }).check()
    await patient.getByRole('button', { name: 'Aceitar e entrar na espera' }).click()
    await patient.getByRole('heading', { name: 'Você está na sala de espera' }).waitFor()
    await capture(patient, 'aurora-waiting', 390)
    await doctor.goto('/login')
    await doctor.locator('input[name="uid"]').fill(a.user.email)
    await doctor.locator('input[name="password"]').fill('TelemedBrowser2026!')
    await doctor.getByRole('button', { name: 'Entrar', exact: true }).click()
    await doctor.waitForURL('**/dashboard')
    await doctor.goto(`/consultations/${a.consultation.id}/room`)
    await doctor.getByRole('button', { name: 'Admitir paciente' }).waitFor()
    await capture(doctor, 'doctor-waiting', 1280)
    await doctor.getByRole('button', { name: 'Admitir paciente' }).click()
    await doctor.getByRole('button', { name: 'Entrar na sala de vídeo' }).click()
    for (const page of [patient, doctor]) {
      await page.getByText('Conectado · Consulta não gravada').waitFor()
      assert.equal(
        await page
          .locator('.video-room [data-lk-theme]')
          .evaluate((room) => getComputedStyle(room).getPropertyValue('--lk-accent-bg').trim()),
        '#0f766e',
        'The LiveKit theme itself must use the clinic color, not override its parent with blue'
      )
      await page.waitForFunction(
        () => {
          const tiles = Array.from(document.querySelectorAll('.lk-participant-tile'))
          return (
            tiles.length === 2 &&
            Array.from(document.querySelectorAll('.lk-participant-tile video')).filter(
              (element) =>
                (element as HTMLVideoElement).videoWidth > 0 &&
                (element as HTMLVideoElement).readyState >= 2
            ).length === 2
          )
        },
        undefined,
        { timeout: 30000 }
      )
    }
    const rooms = await video.rooms.listRooms([video.roomName(a.tenant.id, a.consultation.id)])
    assert.equal(rooms[0].maxParticipants, 2)
    const participants = await video.rooms.listParticipants(
      video.roomName(a.tenant.id, a.consultation.id)
    )
    assert.sameMembers(
      participants.map((participant) => participant.identity),
      [`doctor-${a.consultation.id}`, `patient-${a.consultation.id}`]
    )
    for (const width of [1280, 390]) {
      await capture(patient, 'patient-video', width)
      await capture(doctor, 'doctor-video', width)
    }
    await doctor.getByRole('button', { name: 'Encerrar consulta' }).click()
    await doctor.getByLabel('Desfecho').selectOption('referred_in_person')
    await doctor.getByRole('button', { name: 'Confirmar encerramento' }).click()
    await patient.getByRole('heading', { name: 'Consulta encerrada' }).waitFor()
    await a.consultation.refresh()
    assert.equal(a.consultation.outcome, 'referred_in_person')
    await patient.goto(b.url)
    await patient.getByRole('button', { name: 'Continuar para o termo' }).click()
    await patient.getByRole('button', { name: 'Aceitar e entrar na espera' }).waitFor()
    for (const width of [1280, 390]) await capture(patient, 'horizonte-consent', width)
    assert.equal(
      await patient
        .locator('.patient-shell')
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue('--clinic-primary').trim()
        ),
      '#6d48a5'
    )
    await patient.getByRole('button', { name: 'Prefiro atendimento presencial' }).click()
    await patient.getByRole('heading', { name: 'Consulta encerrada' }).waitFor()
    await b.consultation.refresh()
    assert.equal(b.consultation.outcome, 'patient_declined')
    assert.deepEqual(errors, [])
  }).timeout(120000)
})
