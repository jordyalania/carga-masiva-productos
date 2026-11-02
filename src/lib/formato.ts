// Formatos de presentación. No se asume ninguna moneda.

export function formatearFecha(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatearPrecio(valor: number) {
  return new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

export function formatearEntero(valor: number) {
  return new Intl.NumberFormat("es-PE").format(valor);
}

export function formatearPorcentaje(parte: number, total: number) {
  if (total === 0) return "0 %";
  return `${Math.round((parte / total) * 100)} %`;
}
