import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { AlertTriangle, ClipboardCheck, FileImage, FileUp, Loader2, ScanSearch } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { analyzeDrawingApi } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR, formatNumber } from "@/utils/formatters";

const initialForm = {
  location: "Nashik",
  building_type: "Standard",
  floors: "1",
  refresh_frequency: "weekly",
  quantity_mode: "hybrid",
};

const initialManualInputs = {
  Brickwork: "",
  Concrete: "",
  Steel: "",
  Plaster: "",
  manual_time_hours: "",
};

export default function DrawingAnalyzerPage() {
  const [formData, setFormData] = useState(initialForm);
  const [manualInputs, setManualInputs] = useState(initialManualInputs);
  const [drawingFile, setDrawingFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  const updateField = (field, value) => setFormData((previous) => ({ ...previous, [field]: value }));
  const updateManualInput = (field, value) => setManualInputs((previous) => ({ ...previous, [field]: value }));

  const onFileChange = (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    if (!["png", "jpg", "jpeg", "pdf"].includes(extension || "")) {
      toast.error("Supported formats: PNG, JPG, PDF");
      return;
    }
    setDrawingFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const onAnalyzeDrawing = async () => {
    if (!drawingFile) {
      toast.error("Please upload a drawing file first.");
      return;
    }

    const manualPayload = {
      Brickwork: manualInputs.Brickwork ? Number(manualInputs.Brickwork) : undefined,
      Concrete: manualInputs.Concrete ? Number(manualInputs.Concrete) : undefined,
      Steel: manualInputs.Steel ? Number(manualInputs.Steel) : undefined,
      Plaster: manualInputs.Plaster ? Number(manualInputs.Plaster) : undefined,
      manual_time_hours: manualInputs.manual_time_hours ? Number(manualInputs.manual_time_hours) : undefined,
    };

    const payload = new FormData();
    payload.append("drawing_file", drawingFile);
    payload.append("location", formData.location);
    payload.append("building_type", formData.building_type);
    payload.append("floors", formData.floors);
    payload.append("refresh_frequency", formData.refresh_frequency);
    payload.append("quantity_mode", formData.quantity_mode);
    payload.append("manual_boq_json", JSON.stringify(manualPayload));

    setLoading(true);
    try {
      const response = await analyzeDrawingApi(payload);
      setAnalysis(response.data);
      toast.success("Drawing analyzed successfully.");
    } catch {
      toast.error("Unable to analyze drawing right now.");
    } finally {
      setLoading(false);
    }
  };

  const onDownloadReport = () => {
    if (!analysis) {
      toast.error("Analyze a drawing first to download report.");
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("AI Estimate Pro - Drawing Analyzer Report", 14, 20);
    doc.setFontSize(11);
    doc.text(`File: ${analysis.file_name}`, 14, 30);
    doc.text(`Generated: ${new Date(analysis.generated_at).toLocaleString("en-IN")}`, 14, 36);
    doc.text(`Location: ${formData.location} | Floors: ${formData.floors} | Mode: ${analysis.quantity_mode}`, 14, 42);

    autoTable(doc, {
      startY: 48,
      head: [["Detected Element", "Count"]],
      body: Object.entries(analysis.detected_elements || {}).map(([key, value]) => [key, String(value)]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["BOQ Item", "Quantity", "Unit"]],
      body: (analysis.boq_items || []).map((item) => [item.item, formatNumber(item.quantity), item.unit]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Cost Head", "Amount"]],
      body: [
        ["Material Cost", formatINR(analysis.cost_estimate.material_cost)],
        ["Labour Cost", formatINR(analysis.cost_estimate.labour_cost)],
        ["Total Estimate", formatINR(analysis.cost_estimate.total_estimate)],
      ],
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Stage", "Duration (days)", "Parallel"]],
      body: (analysis.optimized_schedule || []).map((stage) => [
        stage.stage,
        String(stage.duration_days),
        stage.can_run_parallel ? `Yes (${stage.parallel_with || "planned"})` : "No",
      ]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Item", "Manual Qty", "AI Qty", "Variance %"]],
      body: (analysis.manual_vs_ai_quantities || []).map((row) => [
        row.item,
        formatNumber(row.manual_quantity),
        formatNumber(row.ai_quantity),
        `${row.variance_pct}%`,
      ]),
    });

    doc.text("Design Validation Warnings", 14, doc.lastAutoTable.finalY + 14);
    (analysis.warnings || []).forEach((warning, index) => {
      doc.text(`• [${warning.severity.toUpperCase()}] ${warning.message}`, 14, doc.lastAutoTable.finalY + 22 + index * 6);
    });

    doc.save(`drawing-analyzer-${analysis.analysis_id}.pdf`);
  };

  const costChartData = useMemo(() => {
    if (!analysis) return [];
    return [
      { name: "Material", value: analysis.cost_estimate.material_cost },
      { name: "Labour", value: analysis.cost_estimate.labour_cost },
    ];
  }, [analysis]);

  const boqChartData = useMemo(() => {
    if (!analysis) return [];
    return (analysis.boq_items || [])
      .filter((item) => ["Concrete", "Brickwork", "Steel", "Plaster", "Flooring"].includes(item.item))
      .map((item) => ({
        item: item.item,
        quantity: item.quantity,
      }));
  }, [analysis]);

  return (
    <div className="space-y-6 reveal-up" data-testid="drawing-analyzer-page">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="drawing-analyzer-header">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="drawing-analyzer-heading">
          Drawing Analyzer
        </h1>
        <p className="text-sm text-slate-600 md:text-base" data-testid="drawing-analyzer-subheading">
          Upload floor plans and get AI-based element detection, quantity takeoff, cost estimation, validation warnings, and schedule generation.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12" data-testid="drawing-analyzer-workspace">
        <Card className="border-slate-200 bg-white shadow-sm lg:col-span-7" data-testid="drawing-preview-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl" data-testid="drawing-preview-title">
              <FileImage size={18} className="text-orange-500" /> Drawing Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {previewUrl ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3" data-testid="drawing-preview-container">
                {drawingFile?.type?.includes("pdf") ? (
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="h-[500px] w-full rounded-lg"
                    data-testid="drawing-preview-pdf-object"
                  >
                    <p className="text-sm text-slate-600" data-testid="drawing-preview-pdf-fallback">PDF preview unavailable in browser.</p>
                  </object>
                ) : (
                  <TransformWrapper>
                    {({ zoomIn, zoomOut, resetTransform }) => (
                      <div>
                        <div className="mb-2 flex gap-2" data-testid="drawing-zoom-controls">
                          <Button size="sm" variant="secondary" onClick={() => zoomIn()} data-testid="drawing-zoom-in-button">Zoom In</Button>
                          <Button size="sm" variant="secondary" onClick={() => zoomOut()} data-testid="drawing-zoom-out-button">Zoom Out</Button>
                          <Button size="sm" variant="secondary" onClick={() => resetTransform()} data-testid="drawing-reset-zoom-button">Reset</Button>
                        </div>
                        <TransformComponent>
                          <img src={previewUrl} alt="Drawing preview" className="max-h-[500px] w-full rounded-lg object-contain" data-testid="drawing-preview-image" />
                        </TransformComponent>
                      </div>
                    )}
                  </TransformWrapper>
                )}
              </div>
            ) : (
              <label
                htmlFor="drawing-upload-input"
                className="flex h-[500px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center transition-colors duration-200 hover:border-orange-400 hover:bg-orange-50"
                data-testid="drawing-upload-dropzone"
              >
                <FileUp className="mb-3 text-orange-500" size={32} />
                <p className="text-base font-medium text-slate-700" data-testid="drawing-upload-instruction">Drop PDF/PNG/JPG blueprint here</p>
                <p className="text-sm text-slate-500" data-testid="drawing-upload-format-text">Supported: PNG, JPG, PDF</p>
              </label>
            )}
            <Input id="drawing-upload-input" type="file" accept=".png,.jpg,.jpeg,.pdf" onChange={onFileChange} className="mt-3" data-testid="drawing-upload-input" />
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm lg:col-span-5" data-testid="drawing-controls-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl" data-testid="drawing-controls-title">
              <ScanSearch size={18} className="text-orange-500" /> Analysis Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={formData.location} onChange={(event) => updateField("location", event.target.value)} data-testid="drawing-location-input" placeholder="Location" />

            <Select value={formData.building_type} onValueChange={(value) => updateField("building_type", value)}>
              <SelectTrigger data-testid="drawing-building-type-select"><SelectValue placeholder="Building type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Basic">Basic</SelectItem>
                <SelectItem value="Standard">Standard</SelectItem>
                <SelectItem value="Premium">Premium</SelectItem>
              </SelectContent>
            </Select>

            <Input type="number" min="1" value={formData.floors} onChange={(event) => updateField("floors", event.target.value)} data-testid="drawing-floors-input" placeholder="Floors" />

            <Select value={formData.refresh_frequency} onValueChange={(value) => updateField("refresh_frequency", value)}>
              <SelectTrigger data-testid="drawing-refresh-frequency-select"><SelectValue placeholder="Rate refresh" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>

            <Select value={formData.quantity_mode} onValueChange={(value) => updateField("quantity_mode", value)}>
              <SelectTrigger data-testid="drawing-quantity-mode-select"><SelectValue placeholder="Quantity mode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="strict">Strict</SelectItem>
                <SelectItem value="assisted">Assisted</SelectItem>
                <SelectItem value="hybrid">Hybrid (recommended)</SelectItem>
              </SelectContent>
            </Select>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="drawing-manual-inputs-panel">
              <p className="mb-2 text-sm font-medium text-slate-700" data-testid="drawing-manual-inputs-title">Manual BOQ (optional for comparison)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input type="number" value={manualInputs.Brickwork} onChange={(event) => updateManualInput("Brickwork", event.target.value)} data-testid="manual-brickwork-input" placeholder="Brickwork m³" />
                <Input type="number" value={manualInputs.Concrete} onChange={(event) => updateManualInput("Concrete", event.target.value)} data-testid="manual-concrete-input" placeholder="Concrete m³" />
                <Input type="number" value={manualInputs.Steel} onChange={(event) => updateManualInput("Steel", event.target.value)} data-testid="manual-steel-input" placeholder="Steel tons" />
                <Input type="number" value={manualInputs.Plaster} onChange={(event) => updateManualInput("Plaster", event.target.value)} data-testid="manual-plaster-input" placeholder="Plaster m²" />
              </div>
              <Input type="number" className="mt-2" value={manualInputs.manual_time_hours} onChange={(event) => updateManualInput("manual_time_hours", event.target.value)} data-testid="manual-time-hours-input" placeholder="Manual takeoff time (hours)" />
            </div>

            <div className="flex flex-wrap gap-2" data-testid="drawing-actions-row">
              <Button onClick={onAnalyzeDrawing} disabled={loading} className="rounded-full bg-orange-500 hover:bg-orange-600" data-testid="analyze-drawing-button">
                {loading ? <Loader2 className="animate-spin" size={16} /> : <ScanSearch size={16} />} {loading ? "Analyzing..." : "Analyze Drawing"}
              </Button>
              <Button variant="secondary" onClick={onDownloadReport} className="rounded-full" data-testid="download-drawing-report-button">
                <ClipboardCheck size={16} /> Download Report
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {analysis ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7" data-testid="detected-elements-grid">
            {Object.entries(analysis.detected_elements || {}).map(([key, value]) => (
              <Card key={key} className="border-slate-200 bg-white shadow-sm" data-testid={`detected-element-card-${key}`}>
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500" data-testid={`detected-element-label-${key}`}>{key}</p>
                  <p className="font-mono text-xl text-slate-900" data-testid={`detected-element-value-${key}`}>{value}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="drawing-analysis-results-grid">
            <Card className="border-slate-200 bg-white shadow-sm" data-testid="drawing-boq-table-card">
              <CardHeader><CardTitle className="text-2xl">Automatic Quantity Takeoff (BOQ)</CardTitle></CardHeader>
              <CardContent>
                <Table data-testid="drawing-boq-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analysis.boq_items || []).map((item) => (
                      <TableRow key={item.item} data-testid={`drawing-boq-row-${item.item.toLowerCase().replace(/\s+/g, "-")}`}>
                        <TableCell>{item.item}</TableCell>
                        <TableCell className="font-mono">{formatNumber(item.quantity)}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm" data-testid="drawing-warning-panel-card">
              <CardHeader><CardTitle className="flex items-center gap-2 text-2xl"><AlertTriangle size={18} className="text-orange-500" /> Design Validation Panel</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {(analysis.warnings || []).map((warning, index) => (
                  <div key={`${warning.message}-${index}`} className="rounded-lg border border-orange-200 bg-orange-50 p-3" data-testid={`drawing-warning-item-${index}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">{warning.severity}</p>
                    <p className="text-sm text-slate-700">{warning.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm" data-testid="drawing-cost-breakdown-card">
              <CardHeader><CardTitle className="text-2xl">Cost Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3" data-testid="drawing-material-cost-card"><p className="text-xs text-slate-500">Material Cost</p><p className="font-mono">{formatINR(analysis.cost_estimate.material_cost)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3" data-testid="drawing-labour-cost-card"><p className="text-xs text-slate-500">Labour Cost</p><p className="font-mono">{formatINR(analysis.cost_estimate.labour_cost)}</p></div>
                  <div className="rounded-lg bg-slate-50 p-3" data-testid="drawing-total-cost-card"><p className="text-xs text-slate-500">Total Estimate</p><p className="font-mono">{formatINR(analysis.cost_estimate.total_estimate)}</p></div>
                </div>
                <div className="h-64 w-full overflow-x-auto" data-testid="drawing-cost-pie-chart-wrapper">
                  <PieChart width={360} height={240}>
                    <Pie data={costChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88}>
                      <Cell fill="#0F172A" />
                      <Cell fill="#F97316" />
                    </Pie>
                    <Tooltip formatter={(value) => formatINR(Number(value))} />
                  </PieChart>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm" data-testid="drawing-material-chart-card">
              <CardHeader><CardTitle className="text-2xl">Material Quantity Chart</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 w-full overflow-x-auto" data-testid="drawing-material-bar-chart-wrapper">
                  <BarChart width={560} height={240} data={boqChartData}>
                    <XAxis dataKey="item" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatNumber(Number(value))} />
                    <Bar dataKey="quantity" fill="#F97316" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2" data-testid="drawing-schedule-comparison-grid">
            <Card className="border-slate-200 bg-white shadow-sm" data-testid="drawing-schedule-card">
              <CardHeader><CardTitle className="text-2xl">Construction Schedule Generator</CardTitle></CardHeader>
              <CardContent>
                <Table data-testid="drawing-schedule-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Parallel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analysis.optimized_schedule || []).map((stage) => (
                      <TableRow key={stage.stage} data-testid={`drawing-schedule-row-${stage.stage.toLowerCase().replace(/\s+/g, "-")}`}>
                        <TableCell>{stage.stage}</TableCell>
                        <TableCell className="font-mono">{stage.duration_days} days</TableCell>
                        <TableCell>{stage.can_run_parallel ? `Yes (${stage.parallel_with || "planned"})` : "No"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm" data-testid="drawing-manual-vs-ai-card">
              <CardHeader><CardTitle className="text-2xl">Manual vs AI Comparison</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Table data-testid="drawing-manual-vs-ai-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Manual Qty</TableHead>
                      <TableHead>AI Qty</TableHead>
                      <TableHead>Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(analysis.manual_vs_ai_quantities || []).map((row) => (
                      <TableRow key={row.item} data-testid={`drawing-manual-vs-ai-row-${row.item.toLowerCase()}`}>
                        <TableCell>{row.item}</TableCell>
                        <TableCell className="font-mono">{formatNumber(row.manual_quantity)}</TableCell>
                        <TableCell className="font-mono">{formatNumber(row.ai_quantity)}</TableCell>
                        <TableCell className="font-mono">{row.variance_pct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <Table data-testid="drawing-time-comparison-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead>Time Required</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow data-testid="drawing-time-row-manual"><TableCell>Manual</TableCell><TableCell className="font-mono">{analysis.method_time_comparison.manual_time_required}</TableCell></TableRow>
                    <TableRow data-testid="drawing-time-row-ai"><TableCell>AI</TableCell><TableCell className="font-mono">{analysis.method_time_comparison.ai_time_required}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}