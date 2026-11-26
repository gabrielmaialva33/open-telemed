import type { CSSProperties } from 'react'
import type { Clinic } from './types'

export function brandStyle(clinic?: Partial<Clinic> | null): CSSProperties {
  const primary = clinic?.primary_color || '#0f766e'
  return {
    '--brand': primary,
    '--clinic-primary': primary,
    '--clinic-accent': clinic?.accent_color || '#d1fae5',
    '--color-primary': primary,
    '--color-ring': primary,
    '--lk-accent-bg': primary,
    '--lk-accent-fg': '#ffffff',
    '--lk-control-active-bg': primary,
  } as CSSProperties
}
