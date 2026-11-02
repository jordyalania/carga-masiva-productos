import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const tonos = {
  primary: { chip: "bg-primary-soft text-primary", barra: "bg-primary" },
  success: { chip: "bg-success-soft text-success", barra: "bg-success" },
  warning: { chip: "bg-warning-soft text-warning", barra: "bg-warning" },
  danger: { chip: "bg-destructive-soft text-destructive", barra: "bg-destructive" },
  info: { chip: "bg-info-soft text-info", barra: "bg-info" },
};

interface KpiCardProps {
  titulo: string;
  valor: string;
  icono: LucideIcon;
  tono?: keyof typeof tonos;
  detalle?: string;
}

export function KpiCard({ titulo, valor, icono: Icono, tono = "primary", detalle }: KpiCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-4 shadow-card sm:p-5">
      <span className={cn("absolute inset-x-0 top-0 h-1", tonos[tono].barra)} />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{titulo}</p>
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tonos[tono].chip,
          )}
        >
          <Icono className="size-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{valor}</p>
      {detalle && <p className="mt-1 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}
