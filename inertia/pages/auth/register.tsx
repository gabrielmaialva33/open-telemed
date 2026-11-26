import { Head, Link } from '@inertiajs/react'
import { Layers, Lock, Rocket } from 'lucide-react'

import { RegisterForm } from '~/components/auth'
import { useApp } from '~/hooks/use_app'
import { AuthSplitLayout } from '~/layouts/auth/auth_split_layout'

interface RegisterPageProps {
  errors?: Record<string, string>
}

export default function RegisterPage({ errors }: RegisterPageProps) {
  const application = useApp()

  return (
    <>
      <Head title="Cadastro" />
      <AuthSplitLayout
        title="Criar conta"
        subtitle="Preencha seus dados para criar sua conta"
        panelTitle={`Faça parte do ${application.name}`}
        panelDescription="Sua equipe conectada para cuidar de cada paciente."
        features={[
          {
            title: 'Acesso seguro',
            description: 'Sua conta pessoal para acessar o painel',
            icon: Lock,
          },
          {
            title: 'Sua clínica',
            description: 'A equipe e a agenda reunidas em um só lugar',
            icon: Layers,
          },
          {
            title: 'Cuidado próximo',
            description: 'Prepare-se para atender seus pacientes',
            icon: Rocket,
          },
        ]}
        footer={
          <>
            <span className="text-muted-foreground">Já tem uma conta? </span>
            <Link href="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </>
        }
      >
        <RegisterForm errors={errors} />
      </AuthSplitLayout>
    </>
  )
}
