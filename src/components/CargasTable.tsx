import { Link } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Carga } from "@/data/mock";
import { formatearFecha } from "@/lib/formato";

export function CargasTable({ cargas }: { cargas: Carga[] }) {
  return (
    <Table className="min-w-[560px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-6">Archivo</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="pr-6 text-right">Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cargas.map((carga) => (
          <TableRow key={carga.id}>
            <TableCell className="pl-6">
              <div className="flex items-center gap-2.5 font-medium">
                <FileSpreadsheet className="size-4 shrink-0 text-success" />
                {carga.archivo}
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatearFecha(carga.fecha)}
            </TableCell>
            <TableCell>
              <StatusBadge valor={carga.estado} />
            </TableCell>
            <TableCell className="pr-6 text-right">
              <Button asChild variant="outline" size="sm">
                <Link to="/cargas/$id" params={{ id: carga.id }}>
                  Ver detalle
                </Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
