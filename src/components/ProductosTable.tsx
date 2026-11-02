import { StatusBadge } from "@/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Producto } from "@/data/mock";
import { formatearPrecio } from "@/lib/formato";

export function ProductosTable({ productos }: { productos: Producto[] }) {
  if (productos.length === 0) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        Esta carga aún no tiene productos procesados.
      </p>
    );
  }

  return (
    <Table className="min-w-[520px]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-6">Fila</TableHead>
          <TableHead>Código</TableHead>
          <TableHead>Periodo</TableHead>
          <TableHead>Nombre</TableHead>
          <TableHead className="text-right">Precio</TableHead>
          <TableHead>Resultado</TableHead>
          <TableHead className="pr-6">Motivo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {productos.map((p, index) => (
          <TableRow key={p.fila ?? index}>
            <TableCell className="pl-6">{p.fila ?? index + 2}</TableCell>
            <TableCell className="pl-6 font-mono text-xs text-muted-foreground">
              {p.codigo}
            </TableCell>
            <TableCell>{p.periodo ?? "—"}</TableCell>
            <TableCell className="font-medium">{p.nombre}</TableCell>
            <TableCell className="text-right tabular-nums">{formatearPrecio(p.precio)}</TableCell>
            <TableCell className="pr-6">
              <StatusBadge valor={p.resultado} />
            </TableCell>
            <TableCell className="pr-6 whitespace-normal">{p.motivo ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
