// Derivado do Metronic v9.5.0 (Keenthemes), licença comercial: não redistribuir.
import { Link, usePage } from '@inertiajs/react'
import { useState, type ReactNode } from 'react'
import { ChevronFirst, HeartPulse, Menu, ShieldCheck } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '~/components/ui/sheet'
import { useClinicBrand } from '~/components/telemed/clinic_brand_context'
import { brandStyle } from '~/components/telemed/brand_style'
import { SidebarNav } from './sidebar_nav'
import { TenantSwitcher, UserMenu } from './header_actions'
import '~/css/metronic/demo1.css'
import '~/css/telemed.css'

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  const brand = useClinicBrand()
  return (
    <Link
      href="/dashboard"
      aria-label={brand?.name || 'Open Telemed'}
      className="flex min-w-0 items-center gap-3"
    >
      {brand?.logo_url ? (
        <img
          className="size-10 shrink-0 rounded-lg object-contain"
          src={brand.logo_url}
          alt={`Logo ${brand.name}`}
        />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <HeartPulse className="size-6" />
        </span>
      )}
      {!collapsed && (
        <span className="min-w-0">
          <strong className="block truncate text-sm font-semibold">
            {brand?.name || 'Open Telemed'}
          </strong>
          <span className="text-xs text-muted-foreground">Telemedicina</span>
        </span>
      )}
    </Link>
  )
}

export function Header() {
  const [open, setOpen] = useState(false)
  const brand = useClinicBrand()
  return (
    <header className="header fixed top-0 z-40 start-0 end-0 flex items-center border-b border-border bg-background/95 backdrop-blur">
      <div className="flex w-full min-w-0 items-center justify-between gap-2 px-4 lg:px-8">
        <div className="lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" mode="icon" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[280px] max-w-[85vw] gap-0 p-0"
              style={brandStyle(brand)}
            >
              <SheetTitle className="sr-only">Navegação da clínica</SheetTitle>
              <SheetDescription className="sr-only">
                Acesse as áreas da sua clínica.
              </SheetDescription>
              <div className="border-b p-5">
                <Brand />
              </div>
              <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
        <span className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
          <ShieldCheck className="size-4 text-primary" /> Painel de atendimento
        </span>
        <div className="ms-auto flex min-w-0 items-center gap-3">
          <TenantSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

export function MetronicShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const brand = useClinicBrand()
  const { flash } = usePage().props as {
    flash?: { success?: string; error?: string }
  }
  return (
    <div
      className={`telemed demo1 sidebar-fixed header-fixed layout-initialized min-h-screen ${collapsed ? 'sidebar-collapse' : ''}`}
      style={brandStyle(brand)}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:bg-background focus:p-4"
      >
        Ir para o conteúdo
      </a>
      <aside className="sidebar bg-background border-e border-border fixed top-0 bottom-0 z-50 hidden flex-col lg:flex">
        <div className="sidebar-header relative flex shrink-0 items-center px-5">
          <Brand collapsed={collapsed} />
          <Button
            onClick={() => setCollapsed(!collapsed)}
            size="sm"
            mode="icon"
            variant="outline"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
            className="absolute start-full top-1/2 size-7 -translate-x-1/2 -translate-y-1/2"
          >
            <ChevronFirst className={collapsed ? 'rotate-180' : ''} />
          </Button>
        </div>
        <div className="px-5 pt-7 pb-2 text-[10px] font-semibold tracking-widest text-muted-foreground">
          {collapsed ? '···' : 'ÁREA DE TRABALHO'}
        </div>
        <SidebarNav collapsed={collapsed} />
        {!collapsed && (
          <div className="m-5 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
            <ShieldCheck className="mb-2 size-5 text-primary" />
            Cuidado com privacidade.
            <br />
            Cada atendimento em uma sala exclusiva.
          </div>
        )}
      </aside>
      <div className="wrapper flex min-w-0 grow flex-col">
        <Header />
        <main id="main-content" className="min-w-0 grow p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">
            {flash?.success && (
              <p role="status" className="tm-success">
                {flash.success}
              </p>
            )}
            {flash?.error && (
              <p role="alert" className="tm-error">
                {flash.error}
              </p>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
