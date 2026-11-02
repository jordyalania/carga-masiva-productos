import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// En desarrollo, /api y /auth se envían al gateway local; en Docker lo hace nginx.
export default defineConfig({
  server: {
    proxy: Object.fromEntries(
      ["/api", "/auth"].map((path) => [
        path,
        { target: process.env["API_PROXY_TARGET"] || "http://127.0.0.1:8080", changeOrigin: true },
      ]),
    ),
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths(),
    // src/server.ts envuelve el servidor SSR para capturar errores.
    tanstackStart({ server: { entry: "server" } }),
    nitro(),
    viteReact(),
  ],
});
