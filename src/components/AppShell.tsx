import { Link, useNavigate } from "@tanstack/react-router";
import { BarChart3, FolderUp, LogOut, Menu } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/api";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const navegacion = [
  { to: "/cargas", etiqueta: "Mis cargas", icono: FolderUp },
  { to: "/resumen", etiqueta: "Resumen de productos", icono: BarChart3 },
] as const;

function Navegacion() {
  return (
    <nav className="space-y-1">
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
        General
      </p>
      {navegacion.map(({ to, etiqueta, icono: Icono }) => (
        <Link
          key={to}
          to={to}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-primary data-[status=active]:text-sidebar-primary-foreground data-[status=active]:shadow-glow"
        >
          <Icono className="size-4" />
          {etiqueta}
        </Link>
      ))}
    </nav>
  );
}

function PieUsuario() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar-accent p-3">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
          UD
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            {DEMO_MODE ? "Usuario demo" : "Mi cuenta"}
          </p>
          <p className="truncate text-xs text-sidebar-foreground">{session?.email}</p>
        </div>
      </div>
      <Button
        variant="sidebar"
        size="sm"
        className="mt-3 w-full"
        onClick={() => {
          logout();
          void navigate({ to: "/" });
        }}
      >
        <LogOut />
        Cerrar sesión
      </Button>
    </div>
  );
}

function ContenidoLateral() {
  return (
    <div className="flex h-full flex-col gap-8 p-5">
      <Brand claro />
      <div className="flex-1">
        <Navegacion />
      </div>
      <PieUsuario />
    </div>
  );
}

interface AppShellProps {
  seccion: string;
  children: ReactNode;
}

export function AppShell({ seccion, children }: AppShellProps) {
  const { session, ready } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !session) void navigate({ to: "/", replace: true });
  }, [ready, session, navigate]);
  if (!ready || !session) return <p className="p-8 text-muted-foreground">Comprobando sesión…</p>;
  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar lg:block">
        <ContenidoLateral />
      </aside>

      <header className="sticky top-0 z-20 border-b bg-card/85 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-none bg-sidebar p-0">
              <SheetTitle className="sr-only">Menú</SheetTitle>
              <ContenidoLateral />
            </SheetContent>
          </Sheet>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-muted-foreground sm:inline">Panel</span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="truncate font-semibold">{seccion}</span>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            {DEMO_MODE ? "Modo demo" : "API .NET"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  );
}
