import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Copy, FileSpreadsheet, Rows3, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { useCargas } from "@/lib/cargas-store";
import { useLoad, useLoadRows } from "@/lib/load-queries";
import { DEMO_MODE, pending } from "@/lib/api";
import { Panel } from "@/components/Panel";

import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { GraficoPeriodos } from "@/components/resumen/GraficoPeriodos";
import { GraficoTopPrecios } from "@/components/resumen/GraficoTopPrecios";
import { PeriodFilter } from "@/components/resumen/PeriodFilter";
import { TablaResumen } from "@/components/resumen/TablaResumen";
import { archivoResumen, filasArchivo, periodosResumen } from "@/data/resumen-mock";
import { formatearEntero, formatearPorcentaje, formatearPrecio } from "@/lib/formato";
import {
  fromApiRows,
  calcularIndicadores,
  clasificarFilas,
  filtrarPorPeriodo,
  seriePorPeriodo,
  topPorPrecio,
  TODOS,
} from "@/lib/resumen";

export const Route = createFileRoute("/resumen")({
  head: () => ({
    meta: [
      { title: "Resumen de productos · Carga masiva" },
      {
        name: "description",
        content: "Filas recibidas, productos aceptados, duplicados y precios por periodo.",
      },
      { property: "og:title", content: "Resumen de productos · Carga masiva" },
      {
        property: "og:description",
        content: "Filas recibidas, productos aceptados, duplicados y precios por periodo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResumenPage,
});

// Clasificación sobre el archivo completo, antes de cualquier filtro.
const filasClasificadas = clasificarFilas(filasArchivo);
const opcionesPeriodo = [{ valor: TODOS, etiqueta: "Todos" }, ...periodosResumen];
const etiquetaPeriodo = (valor: string) =>
  periodosResumen.find((p) => p.valor === valor)?.etiqueta ?? valor;

function ResumenPage() {
  const [periodo, setPeriodo] = useState(TODOS);
  const { cargas, loading, error, page, setPage, total } = useCargas();
  const [selected, setSelected] = useState("");
  const selectedCarga =
    cargas.find((c) => c.id === selected) ??
    cargas.find((c) => ["Finalizado", "Notificado", "Cargado"].includes(c.estado)) ??
    cargas[0];
  const detail = useLoad(selectedCarga?.id ?? "");
  const rows = useLoadRows(
    selectedCarga?.id ?? "",
    !!detail.data && !pending(detail.data.load.status),
  );
  const source = useMemo(
    () => (DEMO_MODE ? filasClasificadas : fromApiRows(rows.data ?? [])),
    [rows.data],
  );
  const periodos = useMemo(
    () =>
      DEMO_MODE
        ? periodosResumen
        : [...new Set(source.map((f) => f.periodo).filter(Boolean))]
            .sort()
            .map((valor) => ({ valor, etiqueta: valor })),
    [source],
  );
  const opciones = [{ valor: TODOS, etiqueta: "Todos" }, ...periodos];
  const activo = periodo === TODOS || periodos.some((p) => p.valor === periodo) ? periodo : TODOS;

  const { indicadores, serie, top, aceptadas } = useMemo(() => {
    const filtradas = filtrarPorPeriodo(source, activo);
    return {
      indicadores: calcularIndicadores(filtradas),
      serie: seriePorPeriodo(filtradas, periodos),
      top: topPorPrecio(filtradas, 5),
      aceptadas: filtradas.filter((f) => f.estado === "Aceptada"),
    };
  }, [source, activo, periodos]);

  return (
    <AppShell seccion="Resumen de productos">
      <PageHeader
        titulo="Resumen de productos"
        subtitulo={
          <span className="inline-flex items-center gap-1.5">
            <FileSpreadsheet className="size-4 text-success" />
            {DEMO_MODE ? archivoResumen : (selectedCarga?.archivo ?? "Selecciona una carga")}
          </span>
        }
        acciones={<PeriodFilter opciones={opciones} valor={activo} onCambiar={setPeriodo} />}
      />

      {!DEMO_MODE && (
        <Panel>
          <label htmlFor="summary-load" className="mb-2 block text-sm font-medium">
            Archivo cargado
          </label>
          <select
            id="summary-load"
            className="w-full rounded-lg border bg-card px-3 py-2"
            value={selectedCarga?.id ?? ""}
            onChange={(e) => {
              setSelected(e.target.value);
              setPeriodo(TODOS);
            }}
          >
            {!cargas.length && <option value="">Sin cargas disponibles</option>}
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.archivo} · {c.estado} · {formatearEntero(c.resumen.insertados)} insertados
              </option>
            ))}
          </select>
          {total > 100 && (
            <div className="mt-3 flex gap-4">
              <button
                disabled={page === 1}
                onClick={() => {
                  setPage(page - 1);
                  setSelected("");
                }}
              >
                Cargas anteriores
              </button>
              <span>Página {page}</span>
              <button
                disabled={page * 100 >= total}
                onClick={() => {
                  setPage(page + 1);
                  setSelected("");
                }}
              >
                Más cargas
              </button>
            </div>
          )}
          {(loading || detail.isLoading || rows.isLoading) && (
            <p className="mt-3 text-sm" role="status">
              Cargando datos completos…
            </p>
          )}
          {(error || detail.error || rows.error) && (
            <div role="alert" className="mt-3 text-destructive">
              {(error || detail.error || rows.error)?.message}
              <button
                className="ml-3 underline"
                onClick={() => {
                  void detail.refetch();
                  void rows.refetch();
                }}
              >
                Reintentar
              </button>
            </div>
          )}
          {!loading && !cargas.length && (
            <p className="mt-3 text-muted-foreground">
              Sube tu primer Excel desde Mis cargas para ver su resumen.
            </p>
          )}
          {detail.data && pending(detail.data.load.status) && (
            <p className="mt-3 text-muted-foreground">
              El archivo aún está en procesamiento. El resumen estará disponible cuando termine.
            </p>
          )}
          {detail.data?.load.error && (
            <p role="alert" className="mt-3 text-destructive">
              {detail.data.load.error}
            </p>
          )}
        </Panel>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          titulo="Filas recibidas"
          valor={formatearEntero(indicadores.recibidas)}
          icono={Rows3}
          tono="primary"
          detalle="Filas leídas del archivo"
        />
        <KpiCard
          titulo="Productos aceptados"
          valor={formatearEntero(indicadores.aceptadas)}
          icono={CheckCircle2}
          tono="success"
          detalle={`${formatearPorcentaje(indicadores.aceptadas, indicadores.recibidas)} de las filas`}
        />
        <KpiCard
          titulo="Filas duplicadas"
          valor={formatearEntero(indicadores.duplicadas)}
          icono={Copy}
          tono="warning"
          detalle={`${formatearPorcentaje(indicadores.duplicadas, indicadores.recibidas)} de las filas`}
        />
        <KpiCard
          titulo="Precio medio"
          valor={indicadores.precioMedio === null ? "—" : formatearPrecio(indicadores.precioMedio)}
          icono={Tag}
          tono="info"
          detalle="Solo productos aceptados"
        />
      </div>

      {indicadores.invalidas > 0 && (
        <p className="text-sm text-destructive">
          {formatearEntero(indicadores.invalidas)} filas inválidas excluidas de los indicadores de
          precio. Consulta sus motivos en el detalle.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <GraficoPeriodos datos={serie} />
        </div>
        <div className="lg:col-span-2">
          <GraficoTopPrecios productos={top} />
        </div>
      </div>

      <TablaResumen
        key={`${selectedCarga?.id ?? "demo"}-${activo}`}
        filas={aceptadas}
        etiquetaPeriodo={etiquetaPeriodo}
      />
    </AppShell>
  );
}
