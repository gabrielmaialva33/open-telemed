export function clinicalRolePermissions(
  defaultPermissionNames: readonly string[]
): Record<string, string[]> {
  return {
    clinic_owner: [
      'dashboard.read',
      ...defaultPermissionNames.filter((name) =>
        /^(consultations|professionals|consent_texts|tenant_branding)\./.test(name)
      ),
    ],
    doctor: [
      'dashboard.read',
      'consultations.list',
      'consultations.read.own',
      'consultations.attend.own',
    ],
    integrator: [
      'consultations.headless_doctor',
      'consultations.headless_patient',
      'consultations.update',
      'consultations.link',
      'professionals.read',
      'consultations.create',
      'consultations.read',
      'consultations.cancel',
      'consultations.audit',
    ],
  }
}
