import vine from '@vinejs/vine'
export const brazilianStates = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const
export const professionalValidator = vine.compile(
  vine.object({
    user_id: vine.number().positive().withoutDecimals().optional(),
    full_name: vine.string().trim().minLength(2).maxLength(160).optional(),
    email: vine.string().email().normalizeEmail().optional(),
    password: vine.string().minLength(12).maxLength(128).optional(),
    crm: vine
      .string()
      .trim()
      .regex(/^\d{4,10}$/),
    crm_uf: vine.enum(brazilianStates),
    rqe: vine
      .string()
      .trim()
      .regex(/^\d{1,10}$/)
      .nullable()
      .optional(),
  })
)

export const professionalLookupValidator = vine.compile(
  vine.object({
    crm: vine
      .string()
      .trim()
      .regex(/^\d{4,10}$/)
      .optional(),
    crm_uf: vine.enum(brazilianStates).optional(),
  })
)
