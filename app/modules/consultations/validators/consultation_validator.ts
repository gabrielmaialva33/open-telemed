import vine from '@vinejs/vine'

export const createConsultationValidator = vine.compile(
  vine.object({
    professional_id: vine.number().positive().withoutDecimals(),
    external_id: vine.string().trim().maxLength(128).optional(),
    patient_name: vine.string().trim().minLength(2).maxLength(160),
    patient_document: vine.string().trim().maxLength(32).optional(),
    patient_location: vine.string().trim().minLength(2).maxLength(200),
    scheduled_at: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/),
  })
)
export const endConsultationValidator = vine.compile(
  vine.object({
    outcome: vine.enum(['completed', 'referred_in_person', 'no_show']),
  })
)
export const patientSessionValidator = vine.compile(
  vine.object({ secret: vine.string().minLength(32).maxLength(128) })
)
export const patientConsentValidator = vine.compile(
  vine.object({
    accepted: vine.literal(true),
    version: vine.number().positive().withoutDecimals(),
    text_hash: vine.string().regex(/^[a-f0-9]{64}$/),
    recording_allowed: vine.boolean().optional(),
    representative_name: vine.string().trim().minLength(2).maxLength(160).optional(),
    representative_document: vine.string().trim().maxLength(32).optional(),
  })
)

export const patientContextValidator = vine.compile(
  vine.object({ consultation_id: vine.number().positive().withoutDecimals().optional() })
)

export const updateConsultationValidator = vine.compile(
  vine.object({
    professional_id: vine.number().positive().withoutDecimals().optional(),
    scheduled_at: vine
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/)
      .optional(),
  })
)
