import { useEffect, useRef, useState } from 'react'
import { Camera, Mic } from 'lucide-react'
export function DevicePreview() {
  const ref = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [level, setLevel] = useState(0)
  const audioRef = useRef<AudioContext | null>(null)
  const frameRef = useRef<number | null>(null)
  const disposed = useRef(false)
  function stopPreview() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    void audioRef.current?.close()
    audioRef.current = null
  }
  useEffect(() => {
    disposed.current = false
    return () => {
      disposed.current = true
      stopPreview()
    }
  }, [])
  async function preview() {
    setError('')
    try {
      if (!navigator.mediaDevices)
        throw new Error('Abra o link em HTTPS ou localhost para permitir câmera e microfone.')
      stopPreview()
      setReady(false)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      if (disposed.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const audio = new AudioContext()
      audioRef.current = audio
      const analyser = audio.createAnalyser()
      analyser.fftSize = 256
      audio.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      const measure = () => {
        analyser.getByteTimeDomainData(samples)
        const energy = samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0)
        setLevel(Math.min(100, Math.round(Math.sqrt(energy / samples.length) * 300)))
        frameRef.current = requestAnimationFrame(measure)
      }
      measure()
      if (ref.current) ref.current.srcObject = stream
      setReady(true)
    } catch {
      stopPreview()
      setReady(false)
      setError(
        'Não foi possível acessar câmera e microfone. Confira as permissões do navegador e use HTTPS (ou localhost em desenvolvimento).'
      )
    }
  }
  return (
    <section className="device-preview">
      <div className="preview-video">
        <video ref={ref} autoPlay playsInline muted aria-label="Prévia da câmera" />
        {!ready && (
          <div className="preview-placeholder">
            <Camera size={36} />
            <span>Vamos preparar sua consulta</span>
          </div>
        )}
        <span className="preview-label">
          <Mic size={14} />{' '}
          {ready ? 'Câmera e microfone autorizados' : 'Sua imagem aparece somente para você'}
        </span>
      </div>
      <button className="tm-button outline" onClick={() => void preview()}>
        {ready ? 'Testar novamente' : 'Testar câmera e microfone'}
      </button>
      {ready && (
        <div className="microphone-test">
          <label>
            Fale para testar o microfone
            <meter min={0} max={100} value={level} aria-label="Nível do microfone" />
          </label>
          <p className="muted">
            Confirme sua imagem e o movimento da barra. O áudio não é reproduzido nem transmitido
            nesta prévia.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="tm-error">
          {error}
        </p>
      )}
    </section>
  )
}
