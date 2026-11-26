// Keep the bearer fragment only in memory, before Inertia initializes its history.
let pendingSecret: string | null = null
export function capturePatientLinkSecret() {
  if (typeof window === 'undefined' || !/^\/(?:c|t\/[^/]+\/c)$/.test(window.location.pathname))
    return
  pendingSecret = window.location.hash.slice(1) || null
  if (pendingSecret) window.history.replaceState(window.history.state, '', window.location.pathname)
}
export function consumePatientLinkSecret() {
  const secret = pendingSecret
  pendingSecret = null
  return secret
}
