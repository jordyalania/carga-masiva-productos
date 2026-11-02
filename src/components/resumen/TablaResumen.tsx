import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatearEntero, formatearPrecio } from "@/lib/formato";
import type { FilaClasificada } from "@/lib/resumen";

const POR_PAGINA = 10;

interface TablaResumenProps {
  filas: FilaClasificada[];
  etiquetaPeriodo: (valor: string) => string;
}

export function TablaResumen({ filas, etiquetaPeriodo }: TablaResumenProps) {
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const actual = Math.min(pagina, totalPaginas);
  const inicio = (actual - 1) * POR_PAGINA;
  const visibles = filas.slice(inicio, inicio + POR_PAGINA);

  return (
    <Panel
      titulo="Productos aceptados"
      descripcion={`${formatearEntero(filas.length)} productos en el periodo seleccionado`}
      sinRelleno
    >
      <Table className="min-w-[560px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6">Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Periodo</TableHead>
            <TableHead className="pr-6 text-right">Precio unitario</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.map((f) => (
            <TableRow key={f.indice}>
              <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
                {f.codigoProducto}
              </TableCell>
              <TableCell className="font-medium">{f.nombreProducto}</TableCell>
              <TableCell>
                <span className="rounded-md bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
                  {etiquetaPeriodo(f.periodo)}
                </span>
              </TableCell>
              <TableCell className="pr-6 text-right font-semibold tabular-nums">
                {formatearPrecio(f.precio)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-col items-center justify-between gap-3 border-t px-5 py-4 text-sm sm:flex-row sm:px-6">
        <p className="text-muted-foreground">
          {filas.length === 0
            ? "Sin resultados"
            : `Mostrando ${inicio + 1}–${inicio + visibles.length} de ${filas.length}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagina(actual - 1)}
            disabled={actual === 1}
          >
            <ChevronLeft />
            Anterior
          </Button>
          <span className="min-w-16 text-center font-medium tabular-nums">
            {actual} / {totalPaginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagina(actual + 1)}
            disabled={actual === totalPaginas}
          >
            Siguiente
            <ChevronRight />
          </Button>
        </div>
      </div>
    </Panel>
  );
}
