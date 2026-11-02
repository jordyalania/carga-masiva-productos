import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PanelProps {
  titulo?: string;
  descripcion?: ReactNode;
  extra?: ReactNode;
  className?: string;
  children: ReactNode;
  /** Quita el relleno del contenido (útil para tablas a todo el ancho) */
  sinRelleno?: boolean;
}

export function Panel({ titulo, descripcion, extra, className, children, sinRelleno }: PanelProps) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-card", className)}>
      {titulo && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
          <div>
            <h2 className="font-semibold">{titulo}</h2>
            {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
          </div>
          {extra}
        </div>
      )}
      <div className={cn(!sinRelleno && "p-5 sm:p-6", sinRelleno && titulo && "pt-4")}>
        {children}
      </div>
    </section>
  );
}
