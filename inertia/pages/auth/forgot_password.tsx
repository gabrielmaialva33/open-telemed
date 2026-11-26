import { Head, Link } from '@inertiajs/react'
import { KeyRound, MailCheck, ShieldCheck } from 'lucide-react'

import { ForgotPasswordForm } from '~/components/auth'
import { useApp } from '~/hooks/use_app'
import { AuthSplitLayout } from '~/layouts/auth/auth_split_layout'

export default function ForgotPasswordPage() {
  const application = useApp()

  return (
    <>
      <Head title="Recuperar senha" />
      <AuthSplitLayout
        title="Esqueceu sua senha?"
        subtitle="Informe seu e-mail para receber as instruções de recuperação."
        panelTitle={`Recupere seu acesso ao ${application.name}`}
        panelDescription="Volte a acessar sua clínica com segurança. O link recebido pode ser usado uma única vez."
        features={[
          {
            title: 'Sua privacidade',
            description: 'Se o e-mail estiver cadastrado, você receberá as instruções',
            icon: ShieldCheck,
          },
          {
            title: 'Link de uso único',
            description: 'Use sempre o link mais recente que recebeu',
            icon: KeyRound,
          },
          {
            title: 'Confira seu e-mail',
            description: 'Procure a mensagem também na pasta de spam',
            icon: MailCheck,
          },
        ]}
        footer={
          <Link href="/login" className="font-medium text-primary hover:underline">
            Voltar para entrar
          </Link>
        }
      >
        <ForgotPasswordForm />
      </AuthSplitLayout>
    </>
  )
}
