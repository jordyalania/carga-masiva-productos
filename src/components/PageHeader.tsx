import type { ReactNode } from "react";

interface PageHeaderProps {
  titulo: string;
  subtitulo?: ReactNode;
  acciones?: ReactNode;
}

export function PageHeader({ titulo, subtitulo, acciones }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{titulo}</h1>
        {subtitulo && <div className="mt-1.5 text-sm text-muted-foreground">{subtitulo}</div>}
      </div>
      {acciones && <div className="shrink-0">{acciones}</div>}
    </div>
  );
}
