import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyPatientLink({ value }: { value: string }) {
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setMessage('Link copiado. Envie diretamente ao paciente.')
    } catch {
      setCopied(false)
      setMessage('Não foi possível copiar. Selecione o link acima e copie manualmente.')
    }
  }
  return (
    <div key={value} className="patient-link-box">
      <input
        aria-label="Link do paciente"
        readOnly
        value={value}
        onFocus={(event) => event.currentTarget.select()}
      />
      <button type="button" className="tm-button outline" onClick={() => void copy()}>
        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copiado' : 'Copiar link'}
      </button>
      <p role="status" className="muted mt-2">
        {message}
      </p>
    </div>
  )
}
