import { useNavigate } from "@tanstack/react-router";
import { BarChart3, CheckCircle2, Copy, Info } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { DEMO_MODE } from "@/lib/api";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function PanelPromocional() {
  return (
    <div className="relative hidden overflow-hidden bg-gradient-hero p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
      <div className="absolute inset-0 bg-grid-pattern" />
      <div className="relative">
        <Brand claro />
      </div>
      <div className="relative max-w-md">
        <h2 className="text-4xl font-bold leading-tight tracking-tight">
          De un Excel a tu catálogo, en segundos.
        </h2>
        <p className="mt-4 text-sidebar-foreground">
          Sube, valida y revisa tus productos desde un solo panel.
        </p>
        <div className="mt-10 grid grid-cols-3 gap-3">
          {[
            { icono: CheckCircle2, etiqueta: "Aceptados" },
            { icono: Copy, etiqueta: "Duplicados" },
            { icono: BarChart3, etiqueta: "Resumen" },
          ].map(({ icono: Icono, etiqueta }) => (
            <div
              key={etiqueta}
              className="rounded-xl border border-sidebar-border/60 bg-sidebar/40 p-4 backdrop-blur"
            >
              <Icono className="size-5 text-sidebar-primary-foreground" />
              <p className="mt-3 text-sm font-medium">{etiqueta}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="relative text-xs text-sidebar-foreground">© 2026 Carga Masiva</p>
    </div>
  );
}

export function LoginForm() {
  const navigate = useNavigate();

  const { login } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ingresar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      await navigate({ to: "/cargas" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <PanelPromocional />
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Brand className="mb-10 lg:hidden" />
          <h1 className="text-3xl font-bold tracking-tight">Bienvenido</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ingresa para gestionar tus cargas de productos.
          </p>

          <form onSubmit={ingresar} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                autoComplete="username"
                required={!DEMO_MODE}
                type="email"
                placeholder="nombre@empresa.com"
                className="h-11 bg-card"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                autoComplete="current-password"
                required={!DEMO_MODE}
                type="password"
                placeholder="••••••••"
                className="h-11 bg-card"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit" variant="hero" size="lg" className="h-11 w-full">
              {busy ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>

          <p className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5" />
            {DEMO_MODE
              ? "Modo demo: datos de ejemplo, sin conexión al backend."
              : "Acceso mediante el servicio de autenticación .NET."}
          </p>
        </div>
      </div>
    </div>
  );
}
