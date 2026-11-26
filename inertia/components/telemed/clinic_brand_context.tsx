import { createContext, useContext } from 'react'
import { usePage } from '@inertiajs/react'
import { useAuth } from '~/hooks/use_auth'
import type { Clinic } from './types'

export const ClinicBrandContext = createContext<Partial<Clinic> | null | undefined>(undefined)

export function useClinicBrand() {
  const current = useContext(ClinicBrandContext)
  const { clinic } = usePage().props as { clinic?: Clinic }
  const { activeTenant } = useAuth()
  return current === undefined ? clinic || activeTenant : current
}
