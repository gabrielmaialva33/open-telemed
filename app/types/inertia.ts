import type Consultation from '#modules/consultations/models/consultation'
import type ConsultationService from '#modules/consultations/services/consultation_service'
import type ProfessionalService from '#modules/professionals/services/professional_service'
import type User from '#modules/users/models/user'
import type { ModelPaginatorContract } from '@adonisjs/lucid/types/model'
/**
 * Inertia page registry.
 *
 * Inertia v4 types `inertia.render(page, props)` against this interface. Each
 * key is a page component (relative to `inertia/pages`) and the value describes
 * the props passed from the controller. Pages without page-specific props use
 * an empty object.
 */
import type { FileListResult } from '#modules/files/services/list_files_service'
import type GetConsultationOverviewService from '#modules/web/services/get_consultation_overview_service'
import type { publicClinic } from '#modules/tenants/services/public_clinic_service'
type PublicBrand = { clinic?: ReturnType<typeof publicClinic> | null }
import type { WebRole } from '#modules/web/services/list_roles_with_permissions_service'
import type { WebPermission } from '#modules/web/services/list_all_permissions_service'

type SettingsProfile = {
  id: number
  full_name: string
  email: string
  username: string | null
}

declare module '@adonisjs/inertia/types' {
  interface InertiaPages {
    // Auth
    'auth/login': PublicBrand
    'auth/register': PublicBrand
    'auth/forgot_password': PublicBrand
    'auth/reset_password': PublicBrand & { token: string }

    // Root / misc
    'home': Record<string, never>
    'telemed/consultations': PublicBrand & {
      consultations: ReturnType<Consultation['toRecord']>[]
      canManage: boolean
      professionals: Awaited<ReturnType<ProfessionalService['list']>>
    }
    'telemed/consultation': PublicBrand & {
      consultation: Awaited<ReturnType<ConsultationService['record']>>
      room: boolean
      canAttend: boolean
      canManage: boolean
    }
    'telemed/patient': { clinic: ReturnType<typeof publicClinic> | null }
    'telemed/clinic': PublicBrand & {
      settings: ReturnType<typeof publicClinic> & {
        custom_hosts: string[]
        webhook_url: string | null
        has_webhook_secret: boolean
      }
      term: { version: number; hash: string; body: string }
    }
    'telemed/professionals': PublicBrand & {
      professionals: Awaited<ReturnType<ProfessionalService['list']>>
      members: { id: number; full_name: string }[]
    }
    'data_grid_demo': Record<string, never>
    'dashboard': PublicBrand & {
      overview: Awaited<ReturnType<GetConsultationOverviewService['run']>>
    }

    // Files
    'files/index': { files: FileListResult }

    // Roles
    'roles/index': { roles: WebRole[] }

    // Permissions
    'permissions/index': { permissions: WebPermission[] }

    // Settings
    'settings/index': { profile: SettingsProfile }

    // Users
    'users/index': {
      users: ReturnType<ModelPaginatorContract<User>['toJSON']>
      search: string
      sortBy: string
      direction: string
    }
    'users/create': Record<string, never>
    'users/edit': {
      user: User | null
    }

    // Error pages
    'errors/not_found': {
      error: { message: string; status?: number; code?: string; stack?: string }
    }
    'errors/server_error': {
      error: { message: string; status?: number; code?: string; stack?: string }
    }
  }
}
