import { useRef, useState, type DragEvent } from "react";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api, DEMO_MODE } from "@/lib/api";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EXTENSIONES = [".xlsx"];

export function UploadZone({
  onSubir,
}: {
  onSubir: (archivo: File, destinatarios?: string[]) => Promise<void>;
}) {
  const [destinatarios, setDestinatarios] = useState("");
  const correo = useQuery({
    queryKey: ["notification-settings"],
    queryFn: api.notificationSettings,
    enabled: !DEMO_MODE,
    retry: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const seleccionar = (file?: File) => {
    if (!file) return;
    const valido = EXTENSIONES.some((ext) => file.name.toLowerCase().endsWith(ext));
    if (!valido || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("Selecciona un archivo .xlsx no vacío de hasta 10 MiB.");
      setArchivo(null);
      return;
    }
    setError("");
    setArchivo(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    seleccionar(e.dataTransfer.files[0]);
  };

  const subir = async () => {
    if (!archivo) return;
    setBusy(true);
    setError("");
    try {
      const emails = destinatarios
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (
        emails.length > 5 ||
        emails.some((s) => s.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s))
      )
        throw new Error("Indica hasta cinco correos válidos, separados por comas.");
      await onSubir(archivo, [...new Set(emails.map((s) => s.toLowerCase()))]);
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          arrastrando
            ? "border-primary bg-primary-soft"
            : "border-input bg-muted hover:border-primary hover:bg-primary-soft",
        )}
      >
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-card text-primary shadow-card">
          <UploadCloud className="size-6" />
        </div>
        <p className="font-medium">
          Arrastra tu archivo aquí o <span className="text-primary">selecciónalo</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Formato permitido: .xlsx · máximo 10 MiB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={EXTENSIONES.join(",")}
          className="hidden"
          onChange={(e) => seleccionar(e.target.files?.[0])}
        />
      </div>

      <section className="space-y-2 rounded-xl border bg-card p-4" aria-labelledby="correo-titulo">
        <h3 id="correo-titulo" className="font-medium">
          Notificación por correo
        </h3>
        {DEMO_MODE ? (
          <p className="text-sm text-muted-foreground">Modo demo: no se envían correos.</p>
        ) : correo.data ? (
          <p className="break-all text-sm text-muted-foreground">
            Remitente: <strong>{correo.data.sender}</strong>
          </p>
        ) : correo.isError ? (
          <p className="text-sm text-muted-foreground">
            No se pudo consultar el remitente.{" "}
            <button type="button" className="underline" onClick={() => void correo.refetch()}>
              Reintentar
            </button>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Consultando remitente…</p>
        )}
        <label htmlFor="destinatarios" className="block text-sm font-medium">
          Destinatarios de esta carga (opcional)
        </label>
        <Textarea
          id="destinatarios"
          value={destinatarios}
          disabled={busy}
          maxLength={1500}
          onChange={(e) => setDestinatarios(e.target.value)}
          placeholder="persona@ejemplo.com, otra@ejemplo.com"
          rows={2}
          aria-describedby="destinatarios-ayuda"
        />
        <p id="destinatarios-ayuda" className="text-xs text-muted-foreground">
          Hasta 5 correos separados por comas. Recibirán el resultado al terminar el procesamiento,
          con sus direcciones ocultas entre sí.
          {correo.data && (
            <>
              {" "}
              Si lo dejas vacío, se enviará a{" "}
              {correo.data.defaultRecipient || "tu correo de sesión"}.
            </>
          )}
        </p>
      </section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <div className="min-w-0 flex-1">
          {archivo && (
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <FileSpreadsheet className="size-4 shrink-0 text-success" />
              <span className="truncate">{archivo.name}</span>
              <button
                type="button"
                onClick={() => setArchivo(null)}
                className="ml-auto text-muted-foreground hover:text-foreground"
                aria-label="Quitar archivo"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
        <Button onClick={subir} disabled={!archivo || busy} className="sm:w-auto">
          <UploadCloud />
          {busy ? "Subiendo…" : "Subir archivo"}
        </Button>
      </div>
    </div>
  );
}
