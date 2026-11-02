export const DEMO_MODE = import.meta.env["VITE_DEMO_MODE"] === "true";
const BASE_URL = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/$/, "");
export const SESSION_KEY = "carga-masiva-session";
export type EstadoCarga =
  "Pendiente" | "En proceso" | "Cargado" | "Finalizado" | "Notificado" | "Rechazado" | "Fallido";
export interface ApiLoad {
  id: string;
  filename: string;
  status: EstadoCarga;
  result: string | null;
  error: string | null;
  inserted: number;
  existing: number;
  invalid: number;
  created_at: string;
  finished_at: string | null;
  notified_at: string | null;
  recipients?: string[];
}
export interface ApiRow {
  row_num: number;
  period: string;
  code: string;
  name: string;
  price: number;
  outcome: "Insertado" | "Existente" | "Inválido";
  reason: string | null;
}
export interface Page<T> {
  page: number;
  pageSize: number;
  total: number;
  items: T[];
}
export interface LoadDetail {
  load: ApiLoad;
  periods: string[];
  history: { status: string; detail: string | null; at: string }[];
}
export interface Session {
  accessToken: string;
  expiresAt: string;
  email: string;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return value?.accessToken && Date.parse(value.expiresAt) > Date.now() ? value : null;
  } catch {
    return null;
  }
}
async function http(path: string, init: RequestInit = {}, authenticated = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const session = readSession();
  if (authenticated && session) headers.set("Authorization", `Bearer ${session.accessToken}`);
  let response: Response;
  try {
    response = await fetch(BASE_URL + path, { ...init, headers });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      "No se pudo conectar con el backend. Comprueba que Docker esté iniciado o configura la URL HTTPS de la API.",
      0,
    );
  }
  if (!response.ok) {
    if (!authenticated && [404, 405].includes(response.status))
      throw new ApiError(
        "No se encontró el servicio de autenticación. Abre la aplicación desde http://localhost:5180 o configura VITE_API_BASE_URL con la URL del backend.",
        response.status,
      );
    if (response.status === 401 && authenticated && typeof window !== "undefined")
      window.dispatchEvent(new Event("auth:expired"));
    const fallback =
      response.status === 401
        ? "Email o contraseña incorrectos."
        : response.status === 429
          ? "Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo."
          : response.status === 404
            ? "No encontramos esta carga."
            : "La API no pudo completar la solicitud.";
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      typeof payload?.error === "string" ? payload.error : fallback,
      response.status,
    );
  }
  return response;
}
async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await http(path, init);
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(
      "La URL no apunta a la API .NET. Configura VITE_API_BASE_URL o utiliza el proxy local.",
      0,
    );
  return response.json() as Promise<T>;
}
export const api = {
  async login(email: string, password: string): Promise<Session> {
    const response = await http(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      },
      false,
    );
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new ApiError("Configura la URL del backend o inicia la página con el proxy local.", 0);
    const data = await response.json();
    return { accessToken: data.accessToken, expiresAt: data.expiresAt, email };
  },
  loads: (page = 1, signal?: AbortSignal) =>
    json<Page<ApiLoad>>(`/api/cargas?page=${page}&pageSize=100`, signal ? { signal } : {}),
  detail: (id: string, signal?: AbortSignal) =>
    json<LoadDetail>(`/api/cargas/${encodeURIComponent(id)}`, signal ? { signal } : {}),
  rows: (id: string, page = 1, signal?: AbortSignal) =>
    json<Page<ApiRow>>(
      `/api/cargas/${encodeURIComponent(id)}/filas?page=${page}&pageSize=1000`,
      signal ? { signal } : {},
    ),
  async allRows(id: string, signal?: AbortSignal) {
    const first = await this.rows(id, 1, signal);
    const rows = [...first.items];
    for (let page = 2; rows.length < first.total; page++) {
      const next = await this.rows(id, page, signal);
      if (!next.items.length)
        throw new ApiError(
          "El reporte está cambiando. Actualiza para volver a cargarlo completo.",
          409,
        );
      rows.push(...next.items);
    }
    return rows;
  },
  notificationSettings: () =>
    json<{ sender: string; defaultRecipient: string | null }>("/api/cargas/notificacion"),
  async upload(file: File, recipients: string[] = []) {
    const body = new FormData();
    body.append("file", file);
    if (recipients.length) body.append("recipients", recipients.join(","));
    return json<{ id: string; status: EstadoCarga }>("/api/cargas", { method: "POST", body });
  },
  async download(id: string, filename: string) {
    const response = await http(`/api/cargas/${encodeURIComponent(id)}/archivo`);
    const url = URL.createObjectURL(await response.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
export const pending = (status: EstadoCarga) =>
  ["Pendiente", "En proceso", "Cargado"].includes(status);
