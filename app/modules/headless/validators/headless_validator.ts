import vine from '@vinejs/vine'

export const assertionValidator = vine.compile(
  vine.object({ assertion: vine.string().maxLength(8192) })
)
export const claimsValidator = vine.compile(
  vine.object({
    sub: vine.string().minLength(1).maxLength(128),
    jti: vine.string().uuid(),
    iat: vine.number().withoutDecimals(),
    exp: vine.number().withoutDecimals(),
    consultation_id: vine.number().positive().withoutDecimals(),
    action: vine.enum(['state', 'admit', 'video-token', 'end']),
    outcome: vine.enum(['completed', 'referred_in_person', 'no_show']).optional(),
  })
)
export const patientEvidenceValidator = vine.compile(
  vine.object({
    client_ip: vine.string().ipAddress(),
    client_user_agent: vine.string().minLength(1).maxLength(2048),
  })
)
