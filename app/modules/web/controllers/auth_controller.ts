import env from '#start/env'
import NotFoundException from '#exceptions/not_found_exception'
import PublicClinicService, { publicClinic } from '#modules/tenants/services/public_clinic_service'
import { type HttpContext } from '@adonisjs/core/http'
import app from '@adonisjs/core/services/app'

import AuthEventService from '#modules/auth/services/auth_event_service'
import RequestPasswordResetService from '#modules/auth/services/request_password_reset_service'
import ResetPasswordService from '#modules/auth/services/reset_password_service'
import SignInService from '#modules/auth/services/sign_in_service'
import SignUpService from '#modules/auth/services/sign_up_service'
import {
  requestPasswordResetValidator,
  resetPasswordValidator,
} from '#modules/auth/validators/session_validator'
import IRole from '#modules/roles/interfaces/role_interface'
import { createUserValidator, signInValidator } from '#modules/users/validators/users_validator'

export default class InertiaAuthController {
  private async brand(ctx: HttpContext) {
    try {
      const clinic = await new PublicClinicService().resolve(ctx)
      return { clinic: clinic ? publicClinic(clinic) : null }
    } catch (error) {
      if (error instanceof NotFoundException) return { clinic: null }
      throw error
    }
  }

  async showLogin(ctx: HttpContext) {
    return ctx.inertia.render('auth/login', await this.brand(ctx))
  }

  async showRegister(ctx: HttpContext) {
    const { inertia, response } = ctx
    if (env.get('REGISTRATION_WORKSPACE_MODE', 'none') === 'none') return response.notFound()
    return inertia.render('auth/register', await this.brand(ctx))
  }

  async showForgotPassword(ctx: HttpContext) {
    return ctx.inertia.render('auth/forgot_password', await this.brand(ctx))
  }

  async forgotPassword({ request, response, session }: HttpContext) {
    const { email } = await request.validateUsing(requestPasswordResetValidator)
    const service = await app.container.make(RequestPasswordResetService)
    await service.run(email)

    session.flash(
      'success',
      'Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha.'
    )
    return response.redirect().back()
  }

  async showResetPassword(ctx: HttpContext) {
    const { request, inertia } = ctx
    return inertia.render('auth/reset_password', {
      ...(await this.brand(ctx)),
      token: String(request.input('token', '')),
    })
  }

  async resetPassword({ request, response, session }: HttpContext) {
    try {
      const { token, password } = await request.validateUsing(resetPasswordValidator)
      const service = await app.container.make(ResetPasswordService)
      await service.run(token, password)

      session.flash('success', 'Senha redefinida. Você já pode entrar.')
      return response.redirect().toPath('/login')
    } catch {
      session.flash('errors', {
        general: 'Não foi possível redefinir a senha. Solicite um novo link e tente novamente.',
      })
      return response.redirect().back()
    }
  }

  async login(ctx: HttpContext) {
    const { request, response, session, auth } = ctx
    const { uid, password } = await request.validateUsing(signInValidator)

    try {
      const signInService = await app.container.make(SignInService)
      const result = await signInService.run({ uid, password, ctx }, { issueApiTokens: false })

      await auth
        .use('jwt')
        .generate(result.user, result.activeTenantId ? { tenantId: result.activeTenantId } : {})

      return response.redirect('/dashboard')
    } catch {
      session.flash('errors', {
        general: 'E-mail ou senha inválidos. Confira os dados e tente novamente.',
      })
      return response.redirect().back()
    }
  }

  async register(ctx: HttpContext) {
    if (env.get('REGISTRATION_WORKSPACE_MODE', 'none') === 'none') return ctx.response.notFound()
    const { request, response, session, auth } = ctx

    try {
      const data = await request.validateUsing(createUserValidator)
      const signUpService = await app.container.make(SignUpService)
      const { user, activeTenantId, emailVerificationSent } = await signUpService.run(data, {
        issueApiTokens: false,
      })

      await auth.use('jwt').generate(user, activeTenantId ? { tenantId: activeTenantId } : {})
      if (!emailVerificationSent) {
        session.flash(
          'error',
          'Sua conta foi criada, mas não foi possível enviar o e-mail de verificação. Tente reenviar mais tarde.'
        )
      }

      const isAdmin = user.roles.some((role) =>
        [IRole.Slugs.ADMIN, IRole.Slugs.ROOT].includes(role.slug)
      )
      AuthEventService.emitLoginSucceeded(user, 'password', isAdmin, ctx)

      return response.redirect('/dashboard')
    } catch (error) {
      if (error && typeof error === 'object' && 'messages' in error) {
        session.flash('errors', error.messages as Record<string, unknown>)
      } else {
        const message = error instanceof Error ? error.message : 'Registration failed'
        session.flash('errors', { general: message })
      }
      return response.redirect().back()
    }
  }

  async logout(ctx: HttpContext) {
    const user = ctx.auth.user ?? null
    ctx.auth.use('jwt').clearCookie()
    AuthEventService.emitLogout(user, ctx)

    return ctx.response.redirect('/')
  }
}
