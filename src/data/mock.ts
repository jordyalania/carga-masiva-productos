// Datos ficticios locales. Reemplazar por las respuestas del backend más adelante.

export type { EstadoCarga } from "@/lib/api";
import type { EstadoCarga } from "@/lib/api";
export type ResultadoProducto = "Insertado" | "Duplicado" | "Error";

export interface Producto {
  codigo: string;
  nombre: string;
  precio: number;
  resultado: ResultadoProducto;
  fila?: number;
  periodo?: string;
  motivo?: string | null;
}

export interface Carga {
  id: string;
  archivo: string;
  /** Fecha en formato ISO */
  fecha: string;
  estado: EstadoCarga;
  resumen: {
    insertados: number;
    duplicados: number;
    errores: number;
  };
  productos: Producto[];
}

const productosEjemplo: Producto[] = [
  { codigo: "PRD-1001", nombre: "Arroz extra 5 kg", precio: 24.9, resultado: "Insertado" },
  { codigo: "PRD-1002", nombre: "Aceite vegetal 1 L", precio: 11.5, resultado: "Insertado" },
  { codigo: "PRD-1003", nombre: "Azúcar rubia 1 kg", precio: 4.2, resultado: "Duplicado" },
  { codigo: "PRD-1004", nombre: "Leche evaporada 400 g", precio: 3.8, resultado: "Insertado" },
  { codigo: "PRD-1005", nombre: "Fideos spaghetti 500 g", precio: 0, resultado: "Error" },
];

export const cargasIniciales: Carga[] = [
  {
    id: "c-003",
    archivo: "productos_noviembre.xlsx",
    fecha: "2026-10-31T16:20:00-05:00",
    estado: "Pendiente",
    resumen: { insertados: 0, duplicados: 0, errores: 0 },
    productos: [],
  },
  {
    id: "c-002",
    archivo: "catalogo_bebidas.xlsx",
    fecha: "2026-10-29T11:05:00-05:00",
    estado: "En proceso",
    resumen: { insertados: 86, duplicados: 4, errores: 2 },
    productos: productosEjemplo,
  },
  {
    id: "c-001",
    archivo: "inventario_octubre.xlsx",
    fecha: "2026-10-24T09:40:00-05:00",
    estado: "Finalizado",
    resumen: { insertados: 248, duplicados: 12, errores: 5 },
    productos: productosEjemplo,
  },
];
