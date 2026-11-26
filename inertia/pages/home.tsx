import { Head, Link } from '@inertiajs/react'
import { HeartPulse, ShieldCheck, Video, Building2 } from 'lucide-react'
import '~/css/telemed.css'
export default function HomePage() {
  return (
    <div className="telemed patient-shell">
      <Head title="Open Telemed" />
      <header className="patient-header">
        <div className="clinic-brand">
          <span className="brand-symbol">
            <HeartPulse />
          </span>
          <strong>Open Telemed</strong>
        </div>
        <Link className="tm-button outline" href="/login">
          Entrar no painel
        </Link>
      </header>
      <main className="patient-main">
        <section className="waiting-card" style={{ paddingTop: 65 }}>
          <span className="eyebrow">TECNOLOGIA ABERTA, CUIDADO PRÓXIMO</span>
          <h1>
            Sua clínica.
            <br />O cuidado onde o paciente estiver.
          </h1>
          <p>
            Teleconsultas por vídeo, com a identidade da sua clínica, consentimento explícito e uma
            sala privada para cada atendimento.
          </p>
          <Link className="tm-button" href="/login">
            Acessar minha clínica
          </Link>
        </section>
        <div className="stat-grid">
          <section className="tm-card">
            <Video />
            <h2>Um encontro, duas pessoas</h2>
            <p>O paciente aceita o termo e aguarda a admissão pelo médico.</p>
          </section>
          <section className="tm-card">
            <ShieldCheck />
            <h2>A escolha é do paciente</h2>
            <p>Consentimento registrado, gravação desligada e opção pelo atendimento presencial.</p>
          </section>
        </div>
        <section className="tm-card">
          <Building2 />
          <h2>Recebeu um link da sua clínica?</h2>
          <p>
            Abra o link enviado para preparar câmera e microfone e iniciar seu atendimento.
            Pacientes não precisam criar uma conta.
          </p>
        </section>
      </main>
      <footer className="telemed-legal">Open Telemed · Software livre AGPL-3.0-only</footer>
    </div>
  )
}
