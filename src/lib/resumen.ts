import type { FilaArchivo } from "@/data/resumen-mock";

import type { ApiRow } from "./api";
export type EstadoFila = "Aceptada" | "Duplicada" | "Inválida";

export function fromApiRows(rows: ApiRow[]): FilaClasificada[] {
  return rows.map((row) => ({
    indice: row.row_num,
    periodo: row.period,
    codigoProducto: row.code,
    nombreProducto: row.name,
    precio: row.price,
    estado:
      row.outcome === "Insertado"
        ? "Aceptada"
        : row.outcome === "Existente"
          ? "Duplicada"
          : "Inválida",
  }));
}

export interface FilaClasificada extends FilaArchivo {
  /** Posición original en el archivo (0 = primera fila) */
  indice: number;
  estado: EstadoFila;
}

export const TODOS = "todos";

/**
 * Clasifica sobre el archivo completo: la primera aparición de cada código es
 * "Aceptada" y las siguientes "Duplicada". Debe ejecutarse antes de filtrar.
 */
export function clasificarFilas(filas: FilaArchivo[]): FilaClasificada[] {
  const vistos = new Set<string>();
  return filas.map((fila, indice) => {
    const duplicada = vistos.has(fila.codigoProducto);
    vistos.add(fila.codigoProducto);
    return { ...fila, indice, estado: duplicada ? "Duplicada" : "Aceptada" };
  });
}

export function filtrarPorPeriodo(filas: FilaClasificada[], periodo: string) {
  return periodo === TODOS ? filas : filas.filter((f) => f.periodo === periodo);
}

export function calcularIndicadores(filas: FilaClasificada[]) {
  const aceptadas = filas.filter((f) => f.estado === "Aceptada");
  const precioMedio =
    aceptadas.length > 0 ? aceptadas.reduce((s, f) => s + f.precio, 0) / aceptadas.length : null;
  return {
    recibidas: filas.length,
    aceptadas: aceptadas.length,
    duplicadas: filas.filter((f) => f.estado === "Duplicada").length,
    invalidas: filas.filter((f) => f.estado === "Inválida").length,
    precioMedio,
  };
}

export function seriePorPeriodo(
  filas: FilaClasificada[],
  periodos: { valor: string; etiqueta: string }[],
) {
  return periodos
    .map((p) => {
      const delPeriodo = filas.filter((f) => f.periodo === p.valor);
      const aceptadas = delPeriodo.filter((f) => f.estado === "Aceptada").length;
      return {
        periodo: p.valor,
        etiqueta: p.etiqueta,
        aceptadas,
        duplicadas: delPeriodo.filter((f) => f.estado === "Duplicada").length,
        invalidas: delPeriodo.filter((f) => f.estado === "Inválida").length,
      };
    })
    .filter((p) => p.aceptadas + p.duplicadas + p.invalidas > 0);
}

export function topPorPrecio(filas: FilaClasificada[], cantidad = 5) {
  return filas
    .filter((f) => f.estado === "Aceptada")
    .sort((a, b) => b.precio - a.precio)
    .slice(0, cantidad);
}
