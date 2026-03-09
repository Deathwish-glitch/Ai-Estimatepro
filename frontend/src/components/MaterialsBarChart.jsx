import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/utils/formatters";

export const MaterialsBarChart = ({ materials }) => {
  if (!materials?.length) return null;

  const chartData = materials.map((item) => ({
    name: item.name,
    quantity: item.quantity,
  }));

  return (
    <Card className="border-slate-200 bg-white shadow-sm" data-testid="materials-bar-chart-card">
      <CardHeader>
        <CardTitle className="text-lg" data-testid="materials-bar-chart-title">
          Material Quantities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 min-h-72 w-full min-w-0" data-testid="materials-bar-chart-wrapper">
          <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={240}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} />
              <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
              <Tooltip formatter={(value) => formatNumber(Number(value))} />
              <Bar dataKey="quantity" fill="#F97316" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};