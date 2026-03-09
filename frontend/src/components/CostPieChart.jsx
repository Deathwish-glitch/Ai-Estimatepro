import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChartReady } from "@/hooks/useChartReady";
import { formatINR } from "@/utils/formatters";

const chartColors = ["#0F172A", "#F97316", "#10B981", "#64748B"];

export const CostPieChart = ({ costBreakdown }) => {
  const chartReady = useChartReady();
  if (!costBreakdown) return null;

  const data = [
    { name: "Material", value: costBreakdown.material_cost },
    { name: "Labour", value: costBreakdown.labour_cost },
    { name: "Profit", value: costBreakdown.contractor_profit },
    { name: "GST", value: costBreakdown.gst_tax },
  ];

  return (
    <Card className="border-slate-200 bg-white shadow-sm" data-testid="cost-pie-chart-card">
      <CardHeader>
        <CardTitle className="text-lg" data-testid="cost-pie-chart-title">
          Cost Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 min-h-64 w-full overflow-x-auto" data-testid="cost-pie-chart-wrapper">
          {chartReady ? (
            <PieChart width={360} height={240}>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={92} innerRadius={48} cx="50%" cy="50%">
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatINR(Number(value))} />
            </PieChart>
          ) : (
            <div className="h-full w-full rounded-lg bg-slate-50" data-testid="cost-pie-chart-loading-placeholder" />
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3" data-testid="cost-pie-chart-legend">
          {data.map((item, index) => (
            <div key={item.name} className="rounded-lg bg-slate-50 p-3" data-testid={`cost-legend-${item.name.toLowerCase()}`}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index] }} />
                <p className="text-sm text-slate-600">{item.name}</p>
              </div>
              <p className="font-mono text-sm text-slate-900" data-testid={`cost-legend-${item.name.toLowerCase()}-value`}>
                {formatINR(item.value)}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};