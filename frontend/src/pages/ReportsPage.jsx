import { Link } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuildCalc } from "@/context/BuildCalcContext";
import { formatINR } from "@/utils/formatters";

export default function ReportsPage() {
  const { latestEstimate } = useBuildCalc();

  if (!latestEstimate) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm" data-testid="reports-empty-state-card">
        <CardHeader>
          <CardTitle data-testid="reports-empty-state-title">No report data yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600" data-testid="reports-empty-state-description">
            Generate an estimate first to access professional report insights.
          </p>
          <Link to="/estimate" data-testid="reports-empty-state-link">
            <Button className="rounded-full" data-testid="reports-go-to-estimate-button">Go to Estimate</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const comparisonChartData = (latestEstimate.contractor_comparison?.rows || []).map((row) => ({
    category: row.category,
    contractor: row.contractor_cost,
    ai: row.ai_estimate_cost,
  }));

  return (
    <div className="space-y-6 reveal-up" data-testid="reports-page">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="reports-header">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="reports-page-heading">
          Engineering Report Dashboard
        </h1>
        <p className="text-sm text-slate-600 md:text-base" data-testid="reports-page-description">
          Project details, BOQ intelligence, local market analysis, comparison insights, and schedule optimization.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="reports-grid">
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="reports-comparison-table-card">
          <CardHeader>
            <CardTitle className="text-2xl">Cost Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="reports-comparison-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Contractor</TableHead>
                  <TableHead>AI Estimate</TableHead>
                  <TableHead>Savings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(latestEstimate.contractor_comparison?.rows || []).map((row) => (
                  <TableRow key={row.category} data-testid={`reports-comparison-row-${row.category.toLowerCase()}`}>
                    <TableCell>{row.category}</TableCell>
                    <TableCell className="font-mono">{formatINR(row.contractor_cost)}</TableCell>
                    <TableCell className="font-mono">{formatINR(row.ai_estimate_cost)}</TableCell>
                    <TableCell className="font-mono text-emerald-600">{formatINR(row.savings)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-sm text-slate-600" data-testid="reports-total-savings-text">
              Total Savings: {formatINR(latestEstimate.contractor_comparison?.total_savings || 0)} ({latestEstimate.estimated_savings_pct}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm" data-testid="reports-comparison-chart-card">
          <CardHeader>
            <CardTitle className="text-2xl">AI vs Contractor Chart</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 min-h-72 w-full min-w-0" data-testid="reports-comparison-chart-wrapper">
              <ResponsiveContainer width="100%" height="100%" minWidth={280} minHeight={240}>
                <BarChart data={comparisonChartData}>
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatINR(Number(value))} />
                  <Bar dataKey="contractor" fill="#0F172A" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="ai" fill="#F97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="reports-optimized-schedule-card">
        <CardHeader>
          <CardTitle className="text-2xl">Optimized Construction Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="reports-optimized-schedule-table">
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Parallel Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(latestEstimate.optimized_schedule || []).map((item) => (
                <TableRow key={item.stage} data-testid={`reports-optimized-stage-${item.stage.toLowerCase().replace(/\s+/g, "-")}`}>
                  <TableCell>{item.stage}</TableCell>
                  <TableCell className="font-mono">{item.duration_days} days</TableCell>
                  <TableCell>{item.can_run_parallel ? `Parallel with ${item.parallel_with || "other stage"}` : "Sequential"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-slate-500" data-testid="reports-pdf-guidance-text">
            Use the Download PDF button in Estimate page for full presentation-ready report export.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}