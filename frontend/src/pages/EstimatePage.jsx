import { useEffect, useMemo, useState } from "react";
import { Download, Printer, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { CostPieChart } from "@/components/CostPieChart";
import { MaterialsBarChart } from "@/components/MaterialsBarChart";
import { SummaryCards } from "@/components/SummaryCards";
import { UnitConverterCard } from "@/components/UnitConverterCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuildCalc } from "@/context/BuildCalcContext";
import { calculateEstimateApi } from "@/services/api";
import { formatINR, formatNumber } from "@/utils/formatters";

const defaultFormState = {
  plot_size_sqft: "1200",
  built_up_area_sqft: "900",
  floors: "1",
  building_type: "Standard",
  location: "Nashik",
  labour_cost_adjustment_pct: "0",
  material_price_variation_pct: "0",
  refresh_frequency: "weekly",
  contractor_material_cost: "",
  contractor_labour_cost: "",
  contractor_total_cost: "",
};

const buildingTypes = ["Basic", "Standard", "Premium"];

const getNumericInputPayload = (formData) => ({
  plot_size_sqft: Number(formData.plot_size_sqft),
  built_up_area_sqft: Number(formData.built_up_area_sqft),
  floors: Number(formData.floors),
  building_type: formData.building_type,
  location: formData.location,
  labour_cost_adjustment_pct: Number(formData.labour_cost_adjustment_pct),
  material_price_variation_pct: Number(formData.material_price_variation_pct),
  refresh_frequency: formData.refresh_frequency,
  contractor_quote: {
    material_cost: formData.contractor_material_cost ? Number(formData.contractor_material_cost) : null,
    labour_cost: formData.contractor_labour_cost ? Number(formData.contractor_labour_cost) : null,
    total_cost: formData.contractor_total_cost ? Number(formData.contractor_total_cost) : null,
  },
});

export default function EstimatePage() {
  const {
    latestEstimate,
    latestInput,
    savedProjects,
    loadingProjects,
    applyEstimate,
    saveProject: saveProjectToDb,
    loadSavedProject,
  } = useBuildCalc();

  const [formData, setFormData] = useState(defaultFormState);
  const [projectName, setProjectName] = useState("My First Estimate");
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

  const detailedMaterials = latestEstimate?.detailed_materials || [];
  const scheduleData = latestEstimate?.schedule || [];
  const suggestionData = latestEstimate?.suggestions || [];
  const localMarketRates = latestEstimate?.local_market_rates || [];
  const comparisonRows = latestEstimate?.contractor_comparison?.rows || [];
  const optimizedSchedule = latestEstimate?.optimized_schedule || [];

  useEffect(() => {
    if (!latestInput) return;
    setFormData({
      plot_size_sqft: String(latestInput.plot_size_sqft),
      built_up_area_sqft: String(latestInput.built_up_area_sqft),
      floors: String(latestInput.floors),
      building_type: latestInput.building_type,
      location: latestInput.location,
      labour_cost_adjustment_pct: String(latestInput.labour_cost_adjustment_pct),
      material_price_variation_pct: String(latestInput.material_price_variation_pct),
      refresh_frequency: latestInput.refresh_frequency || "weekly",
      contractor_material_cost: latestInput.contractor_quote?.material_cost ? String(latestInput.contractor_quote.material_cost) : "",
      contractor_labour_cost: latestInput.contractor_quote?.labour_cost ? String(latestInput.contractor_quote.labour_cost) : "",
      contractor_total_cost: latestInput.contractor_quote?.total_cost ? String(latestInput.contractor_quote.total_cost) : "",
    });
  }, [latestInput]);

  const costRows = useMemo(() => {
    if (!latestEstimate) return [];
    return [
      ["Material", formatINR(latestEstimate.cost_breakdown.material_cost)],
      ["Labour", formatINR(latestEstimate.cost_breakdown.labour_cost)],
      ["Contractor Profit", formatINR(latestEstimate.cost_breakdown.contractor_profit)],
      ["GST", formatINR(latestEstimate.cost_breakdown.gst_tax)],
      ["Total Estimate", formatINR(latestEstimate.cost_breakdown.total_estimate)],
    ];
  }, [latestEstimate]);

  const updateField = (field, value) => setFormData((previous) => ({ ...previous, [field]: value }));

  const onCalculateEstimate = async () => {
    const payload = getNumericInputPayload(formData);
    if (Object.values(payload).some((value) => value === "" || Number.isNaN(value))) {
      toast.error("Please fill all required fields with valid values.");
      return;
    }

    setLoadingEstimate(true);
    try {
      const response = await calculateEstimateApi(payload);
      applyEstimate(payload, response.data);
      toast.success("Estimate generated successfully.");
    } catch {
      toast.error("Unable to calculate estimate right now.");
    } finally {
      setLoadingEstimate(false);
    }
  };

  const onSaveProject = async () => {
    if (!projectName.trim()) {
      toast.error("Please enter project name before saving.");
      return;
    }

    setSavingProject(true);
    try {
      await saveProjectToDb(projectName, getNumericInputPayload(formData));
      toast.success("Project saved to database.");
    } catch {
      toast.error("Unable to save project now.");
    } finally {
      setSavingProject(false);
    }
  };

  const onDownloadPdf = () => {
    if (!latestEstimate || !latestInput) {
      toast.error("Generate estimate first to download PDF.");
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("AI Estimate Pro - Construction Estimate Report", 14, 20);
    doc.setFontSize(11);
    doc.text(`Project: ${projectName}`, 14, 30);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, 14, 36);

    autoTable(doc, {
      startY: 44,
      head: [["Input", "Value"]],
      body: [
        ["Plot Size", `${formatNumber(latestInput.plot_size_sqft, 0)} sq.ft`],
        ["Built-up Area", `${formatNumber(latestInput.built_up_area_sqft, 0)} sq.ft`],
        ["Floors", String(latestInput.floors)],
        ["Building Type", latestInput.building_type],
        ["Location", latestInput.location],
      ],
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Cost Category", "Amount"]],
      body: costRows,
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Material", "Quantity", "Unit"]],
      body: detailedMaterials.map((item) => [item.name, formatNumber(item.quantity), item.unit]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Schedule Phase", "Week Range", "Milestone"]],
      body: scheduleData.map((item) => [item.phase, `Week ${item.start_week} - ${item.end_week}`, item.milestone || "Planned completion"]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Material", "Avg Local Rate", "Unit", "Sources"]],
      body: localMarketRates.map((item) => [item.material, formatINR(item.avg_local_rate), item.unit, String(item.source_count)]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Category", "Contractor", "AI Estimate", "Savings"]],
      body: comparisonRows.map((row) => [
        row.category,
        formatINR(row.contractor_cost),
        formatINR(row.ai_estimate_cost),
        formatINR(row.savings),
      ]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [["Optimized Stage", "Duration (days)", "Parallel"]],
      body: optimizedSchedule.map((item) => [item.stage, String(item.duration_days), item.can_run_parallel ? `Yes (${item.parallel_with || ""})` : "No"]),
    });

    doc.text("Construction Tips", 14, doc.lastAutoTable.finalY + 14);
    latestEstimate.tips.forEach((tip, index) => {
      doc.text(`• ${tip}`, 14, doc.lastAutoTable.finalY + 22 + index * 6);
    });

    const suggestionStartY = doc.lastAutoTable.finalY + 22 + latestEstimate.tips.length * 6;
    doc.text("Smart Suggestions", 14, suggestionStartY);
    suggestionData.forEach((suggestion, index) => {
      doc.text(`• ${suggestion}`, 14, suggestionStartY + 8 + index * 6);
    });

    doc.save(`${projectName.replace(/\s+/g, "-").toLowerCase()}-estimate.pdf`);
  };

  const onPrintReport = () => {
    if (!latestEstimate) {
      toast.error("Generate estimate first to print report.");
      return;
    }
    window.print();
  };

  return (
    <div className="space-y-8 reveal-up" data-testid="estimate-page">
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]" data-testid="estimate-main-layout">
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="estimate-input-card">
          <CardHeader>
            <CardTitle className="text-3xl text-slate-900" data-testid="estimate-page-title">
              Project Input & Cost Estimation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="project-name-label">
                Project Name
              </label>
              <Input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                data-testid="project-name-input"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="plot-size-label">
                  Plot Size (sq.ft)
                </label>
                <Input
                  type="number"
                  value={formData.plot_size_sqft}
                  data-testid="plot-size-input"
                  onChange={(event) => updateField("plot_size_sqft", event.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="built-up-area-label">
                  Built-up Area (sq.ft)
                </label>
                <Input
                  type="number"
                  value={formData.built_up_area_sqft}
                  data-testid="built-up-area-input"
                  onChange={(event) => updateField("built_up_area_sqft", event.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="floors-label">
                  Number of Floors
                </label>
                <Input
                  type="number"
                  min="1"
                  value={formData.floors}
                  data-testid="floors-input"
                  onChange={(event) => updateField("floors", event.target.value)}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="building-type-label">
                  Building Type
                </label>
                <Select
                  value={formData.building_type}
                  onValueChange={(value) => updateField("building_type", value)}
                >
                  <SelectTrigger data-testid="building-type-select-trigger">
                    <SelectValue placeholder="Choose quality tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {buildingTypes.map((type) => (
                      <SelectItem
                        key={type}
                        value={type}
                        data-testid={`building-type-option-${type.toLowerCase()}`}
                      >
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="location-label">
                  Location
                </label>
                <Input
                  value={formData.location}
                  data-testid="location-input"
                  onChange={(event) => updateField("location", event.target.value)}
                  placeholder="Example: Mumbai / Tier 2 City / Rural"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="labour-adjustment-label">
                  Labour Cost Adjustment (%)
                </label>
                <Input
                  type="number"
                  value={formData.labour_cost_adjustment_pct}
                  data-testid="labour-adjustment-input"
                  onChange={(event) => updateField("labour_cost_adjustment_pct", event.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="material-variation-label">
                  Material Price Variation (%)
                </label>
                <Input
                  type="number"
                  value={formData.material_price_variation_pct}
                  data-testid="material-variation-input"
                  onChange={(event) => updateField("material_price_variation_pct", event.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="refresh-frequency-label">
                  Market Rate Refresh
                </label>
                <Select value={formData.refresh_frequency} onValueChange={(value) => updateField("refresh_frequency", value)}>
                  <SelectTrigger data-testid="refresh-frequency-select-trigger">
                    <SelectValue placeholder="Refresh cycle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily" data-testid="refresh-frequency-option-daily">Daily</SelectItem>
                    <SelectItem value="weekly" data-testid="refresh-frequency-option-weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="contractor-material-cost-label">
                  Contractor Material Cost (optional)
                </label>
                <Input
                  type="number"
                  value={formData.contractor_material_cost}
                  data-testid="contractor-material-cost-input"
                  onChange={(event) => updateField("contractor_material_cost", event.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="contractor-labour-cost-label">
                  Contractor Labour Cost (optional)
                </label>
                <Input
                  type="number"
                  value={formData.contractor_labour_cost}
                  data-testid="contractor-labour-cost-input"
                  onChange={(event) => updateField("contractor_labour_cost", event.target.value)}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700" data-testid="contractor-total-cost-label">
                  Contractor Total Cost (optional)
                </label>
                <Input
                  type="number"
                  value={formData.contractor_total_cost}
                  data-testid="contractor-total-cost-input"
                  onChange={(event) => updateField("contractor_total_cost", event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3" data-testid="estimate-actions">
              <Button
                onClick={onCalculateEstimate}
                disabled={loadingEstimate}
                className="rounded-full bg-orange-500 px-6 transition-colors duration-200 hover:bg-orange-600"
                data-testid="calculate-estimate-button"
              >
                <Sparkles size={16} /> {loadingEstimate ? "Calculating..." : "Calculate Estimate"}
              </Button>
              <Button
                onClick={onSaveProject}
                disabled={savingProject}
                variant="outline"
                className="rounded-full border-slate-300 px-6 transition-colors duration-200"
                data-testid="save-project-button"
              >
                <Save size={16} /> {savingProject ? "Saving..." : "Save Project"}
              </Button>
              <Button
                onClick={onDownloadPdf}
                variant="secondary"
                className="rounded-full px-6 transition-colors duration-200"
                data-testid="download-pdf-button"
              >
                <Download size={16} /> Download PDF
              </Button>
              <Button
                onClick={onPrintReport}
                variant="secondary"
                className="rounded-full px-6 transition-colors duration-200"
                data-testid="print-report-button"
              >
                <Printer size={16} /> Print Report
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4" data-testid="estimate-side-widgets">
          <UnitConverterCard />
          <Card className="border-slate-200 bg-white shadow-sm" data-testid="saved-projects-card">
            <CardHeader>
              <CardTitle className="text-xl" data-testid="saved-projects-title">
                Saved Projects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingProjects ? (
                <p className="text-sm text-slate-500" data-testid="saved-projects-loading">
                  Loading projects...
                </p>
              ) : null}
              {!loadingProjects && !savedProjects.length ? (
                <p className="text-sm text-slate-500" data-testid="saved-projects-empty">
                  No saved projects yet.
                </p>
              ) : null}
              {savedProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    loadSavedProject(project);
                    setProjectName(project.project_name);
                    toast.success("Saved project loaded.");
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors duration-200 hover:bg-slate-100"
                  data-testid={`saved-project-load-button-${project.id}`}
                >
                  <p className="text-sm font-medium text-slate-900" data-testid={`saved-project-name-${project.id}`}>
                    {project.project_name}
                  </p>
                  <p className="text-xs text-slate-500" data-testid={`saved-project-date-${project.id}`}>
                    {new Date(project.created_at).toLocaleDateString("en-IN")}
                  </p>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <SummaryCards estimate={latestEstimate} />

      {latestEstimate ? (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="estimate-results-section">
          <Card className="border-slate-200 bg-white shadow-sm" data-testid="cost-breakdown-table-card">
            <CardHeader>
              <CardTitle className="text-2xl" data-testid="cost-breakdown-table-title">
                Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="cost-breakdown-table">
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="cost-table-column-category">Category</TableHead>
                    <TableHead data-testid="cost-table-column-value">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costRows.map((row) => (
                    <TableRow key={row[0]} data-testid={`cost-row-${row[0].toLowerCase().replace(/\s+/g, "-")}`}>
                      <TableCell data-testid={`cost-category-${row[0].toLowerCase().replace(/\s+/g, "-")}`}>{row[0]}</TableCell>
                      <TableCell className="font-mono" data-testid={`cost-value-${row[0].toLowerCase().replace(/\s+/g, "-")}`}>
                        {row[1]}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm" data-testid="contractor-comparison-card">
            <CardHeader>
              <CardTitle className="text-2xl" data-testid="contractor-comparison-title">
                Contractor vs AI Estimate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="contractor-comparison-table">
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="comparison-column-category">Category</TableHead>
                    <TableHead data-testid="comparison-column-contractor">Contractor</TableHead>
                    <TableHead data-testid="comparison-column-ai">AI Estimate</TableHead>
                    <TableHead data-testid="comparison-column-savings">Savings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparisonRows.map((row) => (
                    <TableRow key={row.category} data-testid={`comparison-row-${row.category.toLowerCase()}`}>
                      <TableCell>{row.category}</TableCell>
                      <TableCell className="font-mono">{formatINR(row.contractor_cost)}</TableCell>
                      <TableCell className="font-mono">{formatINR(row.ai_estimate_cost)}</TableCell>
                      <TableCell className="font-mono text-emerald-600">{formatINR(row.savings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-sm text-slate-600" data-testid="comparison-total-savings-text">
                Total potential savings: <span className="font-mono text-emerald-600">{formatINR(latestEstimate?.contractor_comparison?.total_savings || 0)}</span>
                {" "}({latestEstimate?.estimated_savings_pct || 0}%)
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm" data-testid="local-market-rates-card">
            <CardHeader>
              <CardTitle className="text-2xl" data-testid="local-market-rates-title">
                Local Market Rates (Nashik)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="local-market-rates-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead>Avg Local Rate</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Sources</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localMarketRates.map((item) => (
                    <TableRow key={item.material} data-testid={`local-market-row-${item.material.toLowerCase()}`}>
                      <TableCell>{item.material}</TableCell>
                      <TableCell className="font-mono">{formatINR(item.avg_local_rate)}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="font-mono">{item.source_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm" data-testid="optimized-schedule-card">
            <CardHeader>
              <CardTitle className="text-2xl" data-testid="optimized-schedule-title">
                Construction Speed Optimization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="optimized-schedule-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Parallel Work</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {optimizedSchedule.map((item) => (
                    <TableRow key={item.stage} data-testid={`optimized-stage-${item.stage.toLowerCase().replace(/\s+/g, "-")}`}>
                      <TableCell>{item.stage}</TableCell>
                      <TableCell className="font-mono">{item.duration_days} days</TableCell>
                      <TableCell>{item.can_run_parallel ? `Yes (${item.parallel_with || "planned"})` : "No"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <CostPieChart costBreakdown={latestEstimate.cost_breakdown} />
          <MaterialsBarChart materials={latestEstimate.materials} />

          <Card className="border-slate-200 bg-white shadow-sm" data-testid="construction-tips-card">
            <CardHeader>
              <CardTitle className="text-2xl" data-testid="construction-tips-title">
                Construction Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2" data-testid="construction-tips-list">
                {latestEstimate.tips.map((tip, index) => (
                  <li key={tip} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700" data-testid={`construction-tip-item-${index}`}>
                    {tip}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm" data-testid="smart-suggestions-card">
            <CardHeader>
              <CardTitle className="text-2xl" data-testid="smart-suggestions-title">
                Smart Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2" data-testid="smart-suggestions-list">
                {suggestionData.map((suggestion, index) => (
                  <li
                    key={suggestion}
                    className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"
                    data-testid={`smart-suggestion-item-${index}`}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm xl:col-span-2" data-testid="detailed-material-preview-card">
            <CardHeader>
              <CardTitle className="text-2xl" data-testid="detailed-material-preview-title">
                Detailed Material Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="detailed-material-preview-table">
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="detailed-material-preview-category">Category</TableHead>
                    <TableHead data-testid="detailed-material-preview-name">Material</TableHead>
                    <TableHead data-testid="detailed-material-preview-quantity">Quantity</TableHead>
                    <TableHead data-testid="detailed-material-preview-unit">Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailedMaterials.slice(0, 12).map((material) => (
                    <TableRow
                      key={`${material.category}-${material.name}`}
                      data-testid={`detailed-material-preview-row-${material.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <TableCell data-testid={`detailed-material-preview-category-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>
                        {material.category}
                      </TableCell>
                      <TableCell data-testid={`detailed-material-preview-name-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>
                        {material.name}
                      </TableCell>
                      <TableCell
                        className="font-mono"
                        data-testid={`detailed-material-preview-quantity-${material.name.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {formatNumber(material.quantity)}
                      </TableCell>
                      <TableCell data-testid={`detailed-material-preview-unit-${material.name.toLowerCase().replace(/\s+/g, "-")}`}>
                        {material.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-slate-500" data-testid="detailed-material-preview-note">
                Full detailed list is available in the Materials page.
              </p>
            </CardContent>
          </Card>
        </section>
      ) : (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="estimate-empty-state-card">
          <CardContent className="p-6 text-sm text-slate-600" data-testid="estimate-empty-state-text">
            Fill the project input and click <strong>Calculate Estimate</strong> to view cost, materials, and schedule.
          </CardContent>
        </Card>
      )}
    </div>
  );
}