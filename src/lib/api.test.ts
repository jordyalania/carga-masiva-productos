import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, SESSION_KEY } from "./api";
import { fromApiRows, calcularIndicadores, seriePorPeriodo } from "./resumen";

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      accessToken: "test-token",
      email: "test@example.test",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("API integration contract", () => {
  it("explains a missing authentication service instead of reporting a missing load", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not found", { status: 404 })));
    await expect(api.login("test@example.test", "test-password")).rejects.toThrow(
      "No se encontró el servicio de autenticación",
    );
  });
  it("sends the JWT and preserves paginated history", async () => {
    const mock = vi.fn().mockResolvedValue(response({ page: 2, total: 101, items: [] }));
    vi.stubGlobal("fetch", mock);
    const data = await api.loads(2);
    expect(data.total).toBe(101);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/cargas?page=2&pageSize=100");
    expect(new Headers(mock.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
  });
  it("uploads actual multipart file bytes and lets the browser set the boundary", async () => {
    const mock = vi.fn().mockResolvedValue(response({ id: "load-id", status: "Pendiente" }, 202));
    vi.stubGlobal("fetch", mock);
    const file = new File(["excel-bytes"], "products.xlsx");
    await api.upload(file, ["first@example.test", "second@example.test"]);
    const init = mock.mock.calls[0]?.[1];
    expect(init.body.get("file")).toBe(file);
    expect(init.body.get("recipients")).toBe("first@example.test,second@example.test");
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
  it("fetches all result pages instead of calculating a dashboard from a partial page", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response({ total: 3, items: [{ row_num: 2 }, { row_num: 3 }] }))
        .mockResolvedValueOnce(response({ total: 3, items: [{ row_num: 4 }] })),
    );
    expect((await api.allRows("load-id")).map((row) => row.row_num)).toEqual([2, 3, 4]);
  });
  it("notifies session expiry on an authenticated 401", async () => {
    const expired = vi.fn();
    window.addEventListener("auth:expired", expired);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 401)));
    await expect(api.loads()).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
    window.removeEventListener("auth:expired", expired);
  });
  it("reports a backend failure without substituting demo data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network error")));
    await expect(api.loads()).rejects.toThrow("No se pudo conectar con el backend");
  });
  it("rejects a frontend HTML fallback as a misconfigured API", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<html></html>", { headers: { "content-type": "text/html" } }),
        ),
    );
    await expect(api.loads()).rejects.toThrow("La URL no apunta a la API");
  });
});

describe("Dashboard uses authoritative import outcomes", () => {
  it("does not treat a globally existing code as a new product, and excludes invalid prices", () => {
    const data = fromApiRows([
      {
        row_num: 2,
        code: "A",
        name: "A",
        period: "2026-01",
        price: 10,
        outcome: "Insertado",
        reason: null,
      },
      {
        row_num: 3,
        code: "B",
        name: "B",
        period: "2026-01",
        price: 999,
        outcome: "Existente",
        reason: "Already in database",
      },
      {
        row_num: 4,
        code: "C",
        name: "C",
        period: "2026-02",
        price: 200,
        outcome: "Inválido",
        reason: "Invalid",
      },
    ]);
    expect(calcularIndicadores(data)).toEqual({
      recibidas: 3,
      aceptadas: 1,
      duplicadas: 1,
      invalidas: 1,
      precioMedio: 10,
    });
    expect(seriePorPeriodo(data, [{ valor: "2026-02", etiqueta: "Febrero" }])).toMatchObject([
      { invalidas: 1, aceptadas: 0 },
    ]);
  });
});
