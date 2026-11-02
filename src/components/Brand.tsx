import { Layers } from "lucide-react";

import { cn } from "@/lib/utils";

export function Brand({ className, claro = false }: { className?: string; claro?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
        <Layers className="size-5" />
      </div>
      <div className="leading-tight">
        <p
          className={cn(
            "text-sm font-bold tracking-tight",
            claro && "text-sidebar-accent-foreground",
          )}
        >
          Carga Masiva
        </p>
        <p
          className={cn("text-[11px]", claro ? "text-sidebar-foreground" : "text-muted-foreground")}
        >
          Panel de productos
        </p>
      </div>
    </div>
  );
}
