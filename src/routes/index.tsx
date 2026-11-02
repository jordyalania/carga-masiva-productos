import { createFileRoute } from "@tanstack/react-router";

import { LoginForm } from "@/components/LoginForm";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ingresar · Carga masiva de productos" },
      {
        name: "description",
        content: "Accede para subir y revisar cargas masivas de productos desde Excel.",
      },
      { property: "og:title", content: "Ingresar · Carga masiva de productos" },
      {
        property: "og:description",
        content: "Accede para subir y revisar cargas masivas de productos desde Excel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginForm,
});
