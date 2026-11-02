import { cn } from "@/lib/utils";

interface PeriodFilterProps {
  opciones: { valor: string; etiqueta: string }[];
  valor: string;
  onCambiar: (valor: string) => void;
}

export function PeriodFilter({ opciones, valor, onCambiar }: PeriodFilterProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div
        role="tablist"
        aria-label="Filtrar por periodo"
        className="inline-flex gap-1 rounded-xl border bg-card p-1 shadow-card"
      >
        {opciones.map((o) => {
          const activo = o.valor === valor;
          return (
            <button
              key={o.valor}
              role="tab"
              aria-selected={activo}
              onClick={() => onCambiar(o.valor)}
              className={cn(
                "whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all",
                activo
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
