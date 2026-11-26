import app from '@adonisjs/core/services/app'
import { ExceptionHandler, type HttpContext } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Status pages are used to display a custom HTML pages for certain error
   * codes. You might want to enable them in production only, but feel
   * free to enable them in development as well.
   */
  protected renderStatusPages = app.inProduction

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (error, { inertia }) => inertia.render('errors/not_found', { error }),
    '500..599': (error, { inertia }) => inertia.render('errors/server_error', { error }),
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  private isClinicalRequest(ctx: HttpContext) {
    return /^(?:\/api\/v1)?\/(?:consultations|professionals|headless)(?:\/|$)|^\/(?:professionals|clinic|patient)(?:\/|$)|^\/t\/[^/]+\/patient(?:\/|$)|^\/webhooks\/livekit$/.test(
      ctx.request.url()
    )
  }

  private clinicalFailureStatus(error: unknown) {
    if (!error || typeof error !== 'object') return 500
    const failure = error as { code?: string; status?: number }
    if (failure.code === '23505') return 409
    if (failure.code === '23503') return 422
    return failure.status ?? 500
  }

  async handle(error: unknown, ctx: HttpContext) {
    // Database errors can include SQL bindings containing patient identifiers.
    if (this.isClinicalRequest(ctx)) {
      const status = this.clinicalFailureStatus(error)
      const code = (error as { code?: string } | null)?.code
      if (status >= 500 || code === '23505' || code === '23503') {
        return ctx.response.status(status >= 500 ? 500 : status).json({
          errors: [
            {
              message:
                status === 409
                  ? 'Já existe um registro com esse identificador nesta clínica.'
                  : status === 422
                    ? 'O registro informado não está disponível para esta operação.'
                    : 'Não foi possível concluir a operação. Tente novamente.',
            },
          ],
        })
      }
    }

    // Shield's default HTML redirect is unsuitable for API consumers.
    if (
      ctx.request.url().startsWith('/api/') &&
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'E_BAD_CSRF_TOKEN'
    ) {
      return ctx.response.forbidden({
        errors: [{ code: 'E_BAD_CSRF_TOKEN', message: 'Invalid or expired CSRF token' }],
      })
    }

    /**
     * Handle validation errors from VineJS
     */
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'E_VALIDATION_ERROR'
    ) {
      const validationError = error as any
      if (this.isClinicalRequest(ctx) || ctx.request.accepts(['html', 'json']) === 'json') {
        return ctx.response.status(422).json({
          errors: validationError.messages || [],
        })
      }
      ctx.session.flashAll()
      ctx.session.flash('errors', validationError.messages || {})
      return ctx.response.redirect().back()
    }

    /**
     * Handle rate limiting errors
     */
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'E_TOO_MANY_REQUESTS'
    ) {
      const rateLimitError = error as any

      // Set rate limit headers from the response object
      if (rateLimitError.response) {
        ctx.response.header('x-ratelimit-limit', rateLimitError.response.limit)
        ctx.response.header('x-ratelimit-remaining', rateLimitError.response.remaining)
        ctx.response.header('retry-after', rateLimitError.response.availableIn)
      }

      return ctx.response.status(429).json({
        errors: [
          {
            code: 'E_TOO_MANY_REQUESTS',
            message: rateLimitError.message || 'Too many requests',
            status: 429,
          },
        ],
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    if (this.isClinicalRequest(ctx)) {
      const status = this.clinicalFailureStatus(error)
      if (status >= 500)
        ctx.logger.error({ event: 'clinical_request_failed', status }, 'Falha na operação clínica')
      return
    }
    return super.report(error, ctx)
  }
}
