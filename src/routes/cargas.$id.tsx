import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, CheckCircle2, Copy, FileSpreadsheet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, DEMO_MODE, pending } from "@/lib/api";
import { useLoad, useLoadRows } from "@/lib/load-queries";
import { mapLoad, mapRow } from "@/lib/cargas-store";

import { AppShell } from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { Panel } from "@/components/Panel";
import { ProductosTable } from "@/components/ProductosTable";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { useCargas } from "@/lib/cargas-store";
import { formatearEntero, formatearFecha } from "@/lib/formato";

export const Route = createFileRoute("/cargas/$id")({
  head: () => ({
    meta: [
      { title: "Detalle de carga · Carga masiva de productos" },
      {
        name: "description",
        content: "Resultado de la carga: productos insertados, duplicados y errores.",
      },
      { property: "og:title", content: "Detalle de carga · Carga masiva de productos" },
      {
        property: "og:description",
        content: "Resultado de la carga: productos insertados, duplicados y errores.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DetalleCargaPage,
});

function DetalleCargaPage() {
  const { id } = Route.useParams();
  const { cargas } = useCargas();
  const detail = useLoad(id);
  const rows = useLoadRows(id, !!detail.data && !pending(detail.data.load.status));
  const [page, setPage] = useState(1);
  const [downloadError, setDownloadError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const carga = DEMO_MODE
    ? cargas.find((c) => c.id === id)
    : detail.data
      ? mapLoad(detail.data.load)
      : undefined;
  const productos = DEMO_MODE ? (carga?.productos ?? []) : (rows.data ?? []).map(mapRow);
  const actual = Math.min(page, Math.max(1, Math.ceil(productos.length / 50)));

  return (
    <AppShell seccion="Detalle de carga">
      <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit">
        <Link to="/cargas">
          <ArrowLeft />
          Volver
        </Link>
      </Button>

      {!DEMO_MODE && detail.isLoading ? (
        <p role="status">Cargando detalle…</p>
      ) : detail.error ? (
        <Panel>
          <p role="alert" className="text-destructive">
            {detail.error.message}
          </p>
          <Button onClick={() => void detail.refetch()}>Reintentar</Button>
        </Panel>
      ) : !carga ? (
        <Panel>
          <p className="py-6 text-center font-medium">No encontramos esta carga.</p>
        </Panel>
      ) : (
        <>
          <DetalleEncabezado
            archivo={carga.archivo}
            fecha={formatearFecha(carga.fecha)}
            estado={<StatusBadge valor={carga.estado} />}
            resumen={carga.resumen}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              titulo="Productos insertados"
              valor={formatearEntero(carga.resumen.insertados)}
              icono={CheckCircle2}
              tono="success"
            />
            <KpiCard
              titulo="Duplicados"
              valor={formatearEntero(carga.resumen.duplicados)}
              icono={Copy}
              tono="warning"
            />
            <KpiCard
              titulo="Errores"
              valor={formatearEntero(carga.resumen.errores)}
              icono={AlertCircle}
              tono="danger"
            />
          </div>

          {!DEMO_MODE && (
            <Panel titulo="Seguimiento">
              {detail.data?.load.error && (
                <p role="alert" className="mb-3 text-destructive">
                  {detail.data.load.error}
                </p>
              )}
              {!!detail.data?.load.recipients?.length && (
                <p className="mb-3 break-all text-sm text-muted-foreground">
                  Destinatarios elegidos: {detail.data.load.recipients.join(", ")}
                </p>
              )}
              {detail.data?.load.result && <p className="mb-3">{detail.data.load.result}</p>}
              {carga.estado === "Finalizado" && (
                <p className="mb-3 text-muted-foreground">
                  Procesamiento finalizado; notificación pendiente.
                </p>
              )}
              <ol className="space-y-2">
                {detail.data?.history.map((event, index) => (
                  <li key={index} className="text-sm">
                    <strong>{event.status}</strong> · {formatearFecha(event.at)}
                    {event.detail && (
                      <span className="text-muted-foreground"> — {event.detail}</span>
                    )}
                  </li>
                ))}
              </ol>
              <Button
                disabled={downloading}
                className="mt-4"
                variant="outline"
                onClick={async () => {
                  setDownloading(true);
                  setDownloadError("");
                  try {
                    await api.download(id, carga.archivo);
                  } catch (error) {
                    setDownloadError(
                      error instanceof Error ? error.message : "No se pudo descargar",
                    );
                  } finally {
                    setDownloading(false);
                  }
                }}
              >
                {downloading ? "Descargando…" : "Descargar Excel original"}
              </Button>
              {downloadError && (
                <p role="alert" className="mt-2 text-destructive">
                  {downloadError}
                </p>
              )}
            </Panel>
          )}
          <Panel titulo="Productos" descripcion="Resultados por fila" sinRelleno>
            {rows.isLoading ? (
              <p className="p-6" role="status">
                Cargando resultados completos…
              </p>
            ) : rows.error ? (
              <div className="p-6">
                <p role="alert" className="text-destructive">
                  {rows.error.message}
                </p>
                <Button onClick={() => void rows.refetch()}>Reintentar</Button>
              </div>
            ) : (
              <ProductosTable productos={productos.slice((actual - 1) * 50, actual * 50)} />
            )}
            {productos.length > 50 && (
              <div className="flex items-center justify-end gap-4 p-4">
                <Button
                  variant="outline"
                  disabled={actual === 1}
                  onClick={() => setPage(actual - 1)}
                >
                  Anterior
                </Button>
                <span>
                  {actual} / {Math.ceil(productos.length / 50)}
                </span>
                <Button
                  variant="outline"
                  disabled={actual * 50 >= productos.length}
                  onClick={() => setPage(actual + 1)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </Panel>
        </>
      )}
    </AppShell>
  );
}

interface DetalleEncabezadoProps {
  archivo: string;
  fecha: string;
  estado: ReactNode;
  resumen: { insertados: number; duplicados: number; errores: number };
}

function DetalleEncabezado({ archivo, fecha, estado, resumen }: DetalleEncabezadoProps) {
  const total = resumen.insertados + resumen.duplicados + resumen.errores;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);

  return (
    <Panel>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <FileSpreadsheet className="size-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{archivo}</h1>
            <p className="text-sm text-muted-foreground">{fecha}</p>
          </div>
        </div>
        {estado}
      </div>
      <div className="mt-5">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-success" style={{ width: `${pct(resumen.insertados)}%` }} />
          <div className="bg-warning" style={{ width: `${pct(resumen.duplicados)}%` }} />
          <div className="bg-destructive" style={{ width: `${pct(resumen.errores)}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {total === 0
            ? "Esta carga aún no se ha procesado."
            : `${formatearEntero(total)} filas procesadas`}
        </p>
      </div>
    </Panel>
  );
}
