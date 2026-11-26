import vine from '@vinejs/vine'
import { brazilianStates } from '#modules/professionals/validators/professional_validator'
export const brandingValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    logo_url: vine
      .string()
      .url({ protocols: ['https'], require_protocol: true })
      .maxLength(2048)
      .nullable()
      .optional(),
    primary_color: vine.string().regex(/^#[a-fA-F0-9]{6}$/),
    accent_color: vine.string().regex(/^#[a-fA-F0-9]{6}$/),
    custom_hosts: vine
      .array(
        vine
          .string()
          .trim()
          .toLowerCase()
          .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)
      )
      .maxLength(10),
    legal_name: vine.string().trim().minLength(2).maxLength(200),
    cnpj: vine
      .string()
      .trim()
      .regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/),
    crm_pj: vine
      .string()
      .trim()
      .regex(/^\d{1,20}$/),
    crm_pj_uf: vine.enum(brazilianStates),
    technical_director_name: vine.string().trim().minLength(2).maxLength(160),
    technical_director_crm: vine
      .string()
      .trim()
      .regex(/^\d{4,10}$/),
    technical_director_uf: vine.enum(brazilianStates),
    webhook_url: vine
      .string()
      .url({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
      .maxLength(2048)
      .nullable()
      .optional(),
    webhook_secret: vine.string().minLength(32).maxLength(256).optional(),
  })
)
export const consentTextValidator = vine.compile(
  vine.object({ body: vine.string().trim().minLength(40).maxLength(20000) })
)
