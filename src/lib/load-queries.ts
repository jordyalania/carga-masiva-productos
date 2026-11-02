import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE, pending } from "./api";
import { useAuth } from "./auth";

export function useLoad(id: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["load", id, session?.email],
    queryFn: ({ signal }) => api.detail(id, signal),
    enabled: !!session && !!id && !DEMO_MODE,
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const status = query.state.data?.load.status;
      return !status || pending(status) ? 3000 : status === "Finalizado" ? 10000 : false;
    },
  });
}
export function useLoadRows(id: string, completed: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["load-rows", id, session?.email],
    queryFn: ({ signal }) => api.allRows(id, signal),
    enabled: !!session && !!id && completed && !DEMO_MODE,
    retry: false,
    staleTime: Infinity,
  });
}
