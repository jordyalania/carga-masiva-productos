import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Clock, FolderUp, Loader } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { CargasTable } from "@/components/CargasTable";
import { KpiCard } from "@/components/KpiCard";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { UploadZone } from "@/components/UploadZone";
import { useCargas } from "@/lib/cargas-store";

export const Route = createFileRoute("/cargas/")({
  head: () => ({
    meta: [
      { title: "Mis cargas · Carga masiva de productos" },
      {
        name: "description",
        content: "Sube archivos Excel y revisa el estado de tus cargas de productos.",
      },
      { property: "og:title", content: "Mis cargas · Carga masiva de productos" },
      {
        property: "og:description",
        content: "Sube archivos Excel y revisa el estado de tus cargas de productos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MisCargasPage,
});

function MisCargasPage() {
  const { cargas, agregarCarga, loading, error, refresh, total, page, setPage } = useCargas();
  const navigate = useNavigate();
  const contar = (estado: string) => cargas.filter((c) => c.estado === estado).length;

  return (
    <AppShell seccion="Mis cargas">
      <PageHeader
        titulo="Carga masiva de productos"
        subtitulo="Sube un archivo Excel y sigue el estado de cada carga."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard titulo="Total de cargas" valor={String(total)} icono={FolderUp} tono="primary" />
        <KpiCard
          titulo="Finalizadas en esta página"
          valor={String(contar("Finalizado") + contar("Notificado"))}
          icono={CheckCircle2}
          tono="success"
        />
        <KpiCard
          titulo="En proceso en esta página"
          valor={String(contar("En proceso"))}
          icono={Loader}
          tono="info"
        />
        <KpiCard
          titulo="Pendientes en esta página"
          valor={String(contar("Pendiente"))}
          icono={Clock}
          tono="warning"
        />
      </div>

      <div className="grid gap-6 2xl:grid-cols-3">
        <Panel titulo="Nueva carga" descripcion="Archivo Excel con tus productos">
          <UploadZone
            onSubir={async (file, destinatarios) => {
              const id = await agregarCarga(file, destinatarios);
              await navigate({ to: "/cargas/$id", params: { id } });
            }}
          />
        </Panel>
        <Panel
          titulo="Mis cargas"
          descripcion="Historial de archivos subidos"
          className="2xl:col-span-2"
          sinRelleno
        >
          {loading ? (
            <p className="p-6" role="status">
              Cargando historial…
            </p>
          ) : error ? (
            <div className="p-6">
              <p role="alert" className="text-destructive">
                {error.message}
              </p>
              <button className="mt-3 underline" onClick={refresh}>
                Reintentar
              </button>
            </div>
          ) : cargas.length ? (
            <CargasTable cargas={cargas} />
          ) : (
            <p className="p-6 text-muted-foreground">
              Todavía no tienes cargas. Sube tu primer archivo Excel.
            </p>
          )}
          {total > 100 && (
            <div className="flex items-center justify-end gap-4 p-4">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Anterior
              </button>
              <span>Página {page}</span>
              <button disabled={page * 100 >= total} onClick={() => setPage(page + 1)}>
                Siguiente
              </button>
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
