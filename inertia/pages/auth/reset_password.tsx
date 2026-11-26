import { Head, Link } from '@inertiajs/react'
import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'

import { ResetPasswordForm } from '~/components/auth'
import { useApp } from '~/hooks/use_app'
import { AuthSplitLayout } from '~/layouts/auth/auth_split_layout'

interface ResetPasswordPageProps {
  token: string
}

export default function ResetPasswordPage({ token }: ResetPasswordPageProps) {
  const application = useApp()

  return (
    <>
      <Head title="Redefinir senha" />
      <AuthSplitLayout
        title="Escolha uma nova senha"
        subtitle="Use uma senha forte, diferente das que usa em outros serviços."
        panelTitle={`Proteja seu acesso ao ${application.name}`}
        panelDescription="Defina uma nova senha para voltar ao seu painel com segurança."
        features={[
          {
            title: 'Uso único',
            description: 'Depois de alterar a senha, este link deixa de funcionar',
            icon: KeyRound,
          },
          {
            title: 'Acesso protegido',
            description: 'A troca de senha renova a proteção da sua conta',
            icon: LockKeyhole,
          },
          {
            title: 'Senha pessoal',
            description: 'Não compartilhe sua senha com outras pessoas',
            icon: ShieldCheck,
          },
        ]}
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Voltar para entrar
          </Link>
        }
      >
        <ResetPasswordForm token={token} />
      </AuthSplitLayout>
    </>
  )
}
