import { Panel } from "@/components/Panel";
import { formatearPrecio } from "@/lib/formato";
import type { FilaClasificada } from "@/lib/resumen";

export function GraficoTopPrecios({ productos }: { productos: FilaClasificada[] }) {
  const maximo = productos[0]?.precio ?? 0;

  return (
    <Panel titulo="Top 5 por precio" descripcion="Productos aceptados de mayor precio unitario">
      {productos.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Sin productos aceptados.</p>
      ) : (
        <ol className="space-y-4">
          {productos.map((p, i) => (
            <li key={p.codigoProducto}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className="w-4 shrink-0 text-xs font-bold text-primary">{i + 1}</span>
                  <span className="truncate font-medium">{p.nombreProducto}</span>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatearPrecio(p.precio)}
                </span>
              </div>
              <div className="ml-6.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-primary"
                  style={{ width: `${maximo ? (p.precio / maximo) * 100 : 0}%` }}
                />
              </div>
              <p className="mt-1 ml-6.5 font-mono text-[11px] text-muted-foreground">
                {p.codigoProducto}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
