import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { EstadoCarga, ResultadoProducto } from "@/data/mock";

const variantes: Record<EstadoCarga | ResultadoProducto, BadgeProps["variant"]> = {
  Pendiente: "warning",
  "En proceso": "info",
  Finalizado: "success",
  Cargado: "info",
  Notificado: "success",
  Rechazado: "danger",
  Fallido: "danger",
  Insertado: "success",
  Duplicado: "warning",
  Error: "danger",
};

export function StatusBadge({ valor }: { valor: EstadoCarga | ResultadoProducto }) {
  return (
    <Badge variant={variantes[valor]} className="gap-1.5 whitespace-nowrap">
      <span className="size-1.5 rounded-full bg-current" />
      {valor}
    </Badge>
  );
}
