import { Head } from '@inertiajs/react'
import { ShieldCheck, Users, Video } from 'lucide-react'
import { LoginForm } from '~/components/auth'
import { useApp } from '~/hooks/use_app'
import { AuthSplitLayout } from '~/layouts/auth/auth_split_layout'

export default function LoginPage() {
  const application = useApp()
  return (
    <>
      <Head title="Entrar" />
      <AuthSplitLayout
        title="Entrar"
        subtitle="Acesse com o e-mail e a senha fornecidos pela sua clínica."
        panelTitle={`Bem-vindo ao ${application.name}`}
        panelDescription="Sua clínica, sua equipe e seus pacientes conectados para um cuidado próximo e responsável."
        features={[
          {
            title: 'Atendimento por vídeo',
            description: 'Uma sala privada para médico e paciente',
            icon: Video,
          },
          {
            title: 'Cada clínica com sua marca',
            description: 'Identidade e responsabilidade em cada atendimento',
            icon: Users,
          },
          {
            title: 'Consentimento e privacidade',
            description: 'O paciente escolhe antes de entrar na consulta',
            icon: ShieldCheck,
          },
        ]}
        footer={
          <span className="text-muted-foreground">
            Precisa de acesso? Entre em contato com a administração da sua clínica.
          </span>
        }
      >
        <LoginForm />
      </AuthSplitLayout>
    </>
  )
}
