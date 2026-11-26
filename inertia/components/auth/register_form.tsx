import { FormEvent } from 'react'
import { useForm } from '@inertiajs/react'
import { Loader2 } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card'
import { Alert, AlertContent, AlertDescription } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Field } from '~/components/forms/field'

interface RegisterFormProps {
  errors?: Record<string, string>
}

export function RegisterForm({ errors: serverErrors }: RegisterFormProps = {}) {
  const { data, setData, post, processing, errors } = useForm({
    full_name: '',
    email: '',
    username: '',
    password: '',
    password_confirmation: '',
  })

  const generalError = serverErrors?.general

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    post('/register')
  }

  return (
    <Card className="w-full max-w-md">
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Crie uma conta</CardTitle>
          <CardDescription>Preencha seus dados para começar</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {generalError && (
            <Alert variant="destructive" appearance="light">
              <AlertContent>
                <AlertDescription>{generalError}</AlertDescription>
              </AlertContent>
            </Alert>
          )}

          <Field
            label="Nome completo"
            type="text"
            name="full_name"
            value={data.full_name}
            onChange={(e) => setData('full_name', e.target.value)}
            error={errors.full_name}
            placeholder="Maria Silva"
            required
            autoComplete="name"
          />

          <Field
            label="E-mail"
            type="email"
            name="email"
            value={data.email}
            onChange={(e) => setData('email', e.target.value)}
            error={errors.email}
            placeholder="voce@exemplo.com"
            required
            autoComplete="email"
          />

          <Field
            label="Usuário (opcional)"
            type="text"
            name="username"
            value={data.username}
            onChange={(e) => setData('username', e.target.value)}
            error={errors.username}
            placeholder="maria.silva"
            autoComplete="username"
          />

          <Field
            label="Senha"
            type="password"
            name="password"
            value={data.password}
            onChange={(e) => setData('password', e.target.value)}
            error={errors.password}
            hint="Use pelo menos 8 caracteres"
            required
            autoComplete="new-password"
          />

          <Field
            label="Confirmar senha"
            type="password"
            name="password_confirmation"
            value={data.password_confirmation}
            onChange={(e) => setData('password_confirmation', e.target.value)}
            error={errors.password_confirmation}
            required
            autoComplete="new-password"
          />
        </CardContent>

        <CardFooter>
          <Button type="submit" variant="primary" disabled={processing} className="w-full">
            {processing && <Loader2 className="size-4 animate-spin" />}
            Criar conta
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

export default RegisterForm
