import { useState } from 'react'
import type { Term } from './types'
export type ConsentInput = {
  accepted: true
  version: number
  text_hash: string
  recording_allowed: boolean
  representative_name?: string
  representative_document?: string
}
export function ConsentForm({
  term,
  onAccept,
  busy,
}: {
  term: Term
  onAccept: (input: ConsentInput) => void
  busy: boolean
}) {
  const [accepted, setAccepted] = useState(false)
  const [recording, setRecording] = useState(false)
  const [representative, setRepresentative] = useState(false)
  const [name, setName] = useState('')
  const [document, setDocument] = useState('')
  return (
    <form
      className="telemed-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (accepted)
          onAccept({
            accepted: true,
            version: term.version,
            text_hash: term.hash,
            recording_allowed: recording,
            ...(representative
              ? { representative_name: name, representative_document: document }
              : {}),
          })
      }}
    >
      <div className="term-heading">
        <h2>Seu consentimento importa</h2>
        <span>Versão {term.version}</span>
      </div>
      <div className="consent-text" tabIndex={0}>
        {term.body}
      </div>
      <label className="check-row">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        Li e aceito o termo de teleconsulta e a transmissão de imagens e dados.
      </label>
      <label className="check-row secondary">
        <input
          type="checkbox"
          checked={recording}
          onChange={(e) => setRecording(e.target.checked)}
        />
        Autorizaria gravação, em escolha separada e opcional. Esta plataforma não grava.
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={representative}
          onChange={(e) => setRepresentative(e.target.checked)}
        />
        Sou representante legal do paciente.
      </label>
      {representative && (
        <div className="form-grid">
          <label>
            Nome do representante
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={160}
              autoComplete="off"
            />
          </label>
          <label>
            Documento do representante
            <input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              required
              maxLength={32}
              autoComplete="off"
            />
          </label>
        </div>
      )}
      <button className="tm-button" disabled={!accepted || busy} type="submit">
        {busy ? 'Registrando aceite…' : 'Aceitar e entrar na espera'}
      </button>
    </form>
  )
}
