import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cargasIniciales, type Carga } from "@/data/mock";
import { api, DEMO_MODE, pending, type ApiLoad, type ApiRow } from "./api";
import { useAuth } from "./auth";

export function mapLoad(load: ApiLoad): Carga {
  return {
    id: load.id,
    archivo: load.filename,
    fecha: load.created_at,
    estado: load.status,
    resumen: { insertados: load.inserted, duplicados: load.existing, errores: load.invalid },
    productos: [],
  };
}
export function mapRow(row: ApiRow) {
  return {
    codigo: row.code,
    nombre: row.name,
    precio: row.price,
    fila: row.row_num,
    periodo: row.period,
    motivo: row.reason,
    resultado:
      row.outcome === "Insertado"
        ? ("Insertado" as const)
        : row.outcome === "Existente"
          ? ("Duplicado" as const)
          : ("Error" as const),
  };
}
interface CargasContextValue {
  cargas: Carga[];
  agregarCarga: (archivo: File, destinatarios?: string[]) => Promise<string>;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
  page: number;
  setPage: (page: number) => void;
  total: number;
}
const CargasContext = createContext<CargasContextValue | null>(null);
export function CargasProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [demo, setDemo] = useState<Carga[]>(cargasIniciales);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["loads", session?.email, page],
    queryFn: ({ signal }) => api.loads(page, signal),
    enabled: !!session && !DEMO_MODE,
    retry: false,
    refetchInterval: (q) =>
      q.state.error
        ? false
        : q.state.data?.items.some((l) => pending(l.status) || l.status === "Finalizado")
          ? 10000
          : false,
  });
  const agregarCarga = async (file: File, recipients: string[] = []) => {
    if (DEMO_MODE) {
      const id = `demo-${Date.now()}`;
      setDemo((prev) => [
        {
          id,
          archivo: file.name,
          fecha: new Date().toISOString(),
          estado: "Pendiente",
          resumen: { insertados: 0, duplicados: 0, errores: 0 },
          productos: [],
        },
        ...prev,
      ]);
      return id;
    }
    const result = await api.upload(file, recipients);
    setPage(1);
    void query.refetch();
    return result.id;
  };
  return (
    <CargasContext.Provider
      value={{
        cargas: DEMO_MODE ? demo : (query.data?.items ?? []).map(mapLoad),
        agregarCarga,
        loading: !DEMO_MODE && query.isLoading,
        error: query.error,
        refresh: () => {
          void query.refetch();
        },
        page,
        setPage,
        total: DEMO_MODE ? demo.length : (query.data?.total ?? 0),
      }}
    >
      {children}
    </CargasContext.Provider>
  );
}
export function useCargas() {
  const ctx = useContext(CargasContext);
  if (!ctx) throw new Error("CargasProvider missing");
  return ctx;
}
