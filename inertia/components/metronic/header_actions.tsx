// Derivado do Metronic v9.5.0 (Keenthemes), licença comercial: não redistribuir.
import { Link, router } from '@inertiajs/react'
import { Check, ChevronsUpDown, LogOut } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { useAuth } from '~/hooks/use_auth'
import { useClinicBrand } from '~/components/telemed/clinic_brand_context'
import { brandStyle } from '~/components/telemed/brand_style'

function initialsOf(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function TenantSwitcher() {
  const { tenants, activeTenant } = useAuth()
  const brand = useClinicBrand()

  if (tenants.length === 0) {
    return null
  }

  const switchTenant = (tenantId: number) => {
    if (tenantId === activeTenant?.id) return
    router.post('/tenant/switch', { tenant_id: tenantId }, { preserveScroll: true })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          aria-label="Trocar clínica"
          className="h-9 gap-2 max-w-[175px] sm:max-w-[240px]"
        >
          <Avatar className="size-5">
            <AvatarFallback className="text-[0.625rem]">
              {activeTenant ? initialsOf(brand?.name || activeTenant.name) : '—'}
            </AvatarFallback>
          </Avatar>
          <span className="truncate text-sm font-medium">
            {brand?.name || activeTenant?.name || 'Sem clínica'}
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent style={brandStyle(brand)} align="start" className="w-64">
        <DropdownMenuLabel>Trocar clínica</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onSelect={() => switchTenant(tenant.id)}
            className="gap-2"
          >
            <Avatar className="size-6">
              <AvatarFallback className="text-[0.625rem]">{initialsOf(tenant.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">
                {tenant.id === activeTenant?.id ? brand?.name || tenant.name : tenant.name}
              </span>
              {tenant.role && (
                <span className="text-xs capitalize text-muted-foreground">
                  {{ owner: 'Responsável', admin: 'Administrador', member: 'Membro' }[
                    tenant.role
                  ] || 'Membro'}
                </span>
              )}
            </div>
            {tenant.id === activeTenant?.id && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function UserMenu() {
  const { user } = useAuth()
  const brand = useClinicBrand()

  if (!user) {
    return (
      <Link href="/login">
        <Button variant="outline" size="sm">
          Entrar
        </Button>
      </Link>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          mode="icon"
          className="rounded-full"
          aria-label="Abrir menu do usuário"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-primary">
              {initialsOf(user.full_name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent style={brandStyle(brand)} align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-primary">
              {initialsOf(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{user.full_name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => router.post('/logout')}>
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
