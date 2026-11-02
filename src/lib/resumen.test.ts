import { describe, expect, it } from "vitest";

import { filasArchivo, periodosResumen } from "@/data/resumen-mock";
import {
  calcularIndicadores,
  clasificarFilas,
  filtrarPorPeriodo,
  seriePorPeriodo,
  topPorPrecio,
  TODOS,
} from "@/lib/resumen";

const clasificadas = clasificarFilas(filasArchivo);

describe("Resumen de productos (datos de ejemplo)", () => {
  it("recibe 200 filas, acepta 116 códigos únicos y marca 84 duplicadas", () => {
    expect(calcularIndicadores(clasificadas)).toMatchObject({
      recibidas: 200,
      aceptadas: 116,
      duplicadas: 84,
    });
    expect(new Set(filasArchivo.map((f) => f.codigoProducto)).size).toBe(116);
  });

  it("reparte las filas en enero 47, febrero 105 y marzo 48", () => {
    expect(filtrarPorPeriodo(clasificadas, "2025-01")).toHaveLength(47);
    expect(filtrarPorPeriodo(clasificadas, "2025-02")).toHaveLength(105);
    expect(filtrarPorPeriodo(clasificadas, "2025-03")).toHaveLength(48);
  });

  it("el gráfico por periodo suma lo mismo que las tarjetas", () => {
    for (const periodo of [TODOS, ...periodosResumen.map((p) => p.valor)]) {
      const filas = filtrarPorPeriodo(clasificadas, periodo);
      const ind = calcularIndicadores(filas);
      const serie = seriePorPeriodo(filas, periodosResumen);
      expect(serie.reduce((s, p) => s + p.aceptadas, 0)).toBe(ind.aceptadas);
      expect(serie.reduce((s, p) => s + p.duplicadas, 0)).toBe(ind.duplicadas);
    }
  });
});

describe("Reglas de clasificación", () => {
  it("conserva la primera aparición de cada código y marca las siguientes como duplicadas", () => {
    const filas = clasificarFilas([
      { periodo: "2025-01", codigoProducto: "A", nombreProducto: "A", precio: 10 },
      { periodo: "2025-01", codigoProducto: "A", nombreProducto: "A", precio: 12 },
      { periodo: "2025-01", codigoProducto: "B", nombreProducto: "B", precio: 5 },
    ]);
    expect(filas.map((f) => f.estado)).toEqual(["Aceptada", "Duplicada", "Aceptada"]);
  });

  it("clasifica sobre el archivo completo antes de filtrar por periodo", () => {
    const filas = clasificarFilas([
      { periodo: "2025-01", codigoProducto: "A", nombreProducto: "A", precio: 10 },
      { periodo: "2025-02", codigoProducto: "A", nombreProducto: "A", precio: 10 },
    ]);
    const febrero = calcularIndicadores(filtrarPorPeriodo(filas, "2025-02"));
    expect(febrero).toMatchObject({ recibidas: 1, aceptadas: 0, duplicadas: 1 });
  });

  it("calcula el precio medio y el top solo con productos aceptados", () => {
    const filas = clasificarFilas([
      { periodo: "2025-01", codigoProducto: "A", nombreProducto: "A", precio: 10 },
      { periodo: "2025-01", codigoProducto: "A", nombreProducto: "A", precio: 1000 },
      { periodo: "2025-01", codigoProducto: "B", nombreProducto: "B", precio: 20 },
    ]);
    expect(calcularIndicadores(filas).precioMedio).toBe(15);
    expect(topPorPrecio(filas).map((f) => f.precio)).toEqual([20, 10]);
  });
});
