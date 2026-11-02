import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Panel } from "@/components/Panel";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const config = {
  aceptadas: { label: "Aceptadas", color: "var(--chart-1)" },
  duplicadas: { label: "Duplicadas", color: "var(--chart-2)" },
  invalidas: { label: "Inválidas", color: "var(--destructive)" },
} satisfies ChartConfig;

interface GraficoPeriodosProps {
  datos: { etiqueta: string; aceptadas: number; duplicadas: number; invalidas?: number }[];
}

export function GraficoPeriodos({ datos }: GraficoPeriodosProps) {
  return (
    <Panel titulo="Filas por periodo" descripcion="Resultado real de las filas por periodo">
      <ChartContainer config={config} className="aspect-auto h-[280px] w-full">
        <BarChart data={datos} margin={{ left: -16, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tickMargin={10} />
          <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
          <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar
            dataKey="aceptadas"
            stackId="filas"
            fill="var(--color-aceptadas)"
            radius={[0, 0, 6, 6]}
            maxBarSize={64}
          />
          <Bar
            dataKey="duplicadas"
            stackId="filas"
            fill="var(--color-duplicadas)"
            radius={[6, 6, 0, 0]}
            maxBarSize={64}
          />
          <Bar dataKey="invalidas" stackId="filas" fill="var(--color-invalidas)" maxBarSize={64} />
        </BarChart>
      </ChartContainer>
    </Panel>
  );
}
