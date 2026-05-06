import { useCallback, useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Download, FileSpreadsheet, FileText, Plus, Redo2, Save, Trash2, Undo2 } from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createQsExportLogApi,
  createQsProjectApi,
  createQsProjectVersionApi,
  listLabourRatesApi,
  listMaterialRatesApi,
  listQsBoqApi,
  listQsExportLogsApi,
  listQsMeasurementsApi,
  listQsProjectVersionsApi,
  listQsProjectsApi,
  upsertLabourRatesApi,
  upsertMaterialRatesApi,
  upsertQsBoqApi,
  upsertQsMeasurementsApi,
} from "@/services/api";
import { weatherService } from "@/services/weatherService";
import { useQsStore } from "@/store/qsStore";
import { defaultAutoAssumptions, generateSemiAutomaticEstimate } from "@/utils/qsAutoGenerator";
import { CATEGORY_FORMULAS, buildBoqFromMeasurements, calcTotals, calculateMeasurementRow } from "@/utils/qsFormulaEngine";
import { formatINR, formatNumber } from "@/utils/formatters";

const categories = [
  "Earthwork",
  "Excavation",
  "PCC",
  "Footings",
  "RCC",
  "Columns",
  "Beams",
  "Slabs",
  "Brickwork",
  "Blockwork",
  "Plaster",
  "Flooring",
  "Paint",
  "Waterproofing",
  "Steel/BBS",
  "Doors & Windows",
  "Plumbing",
  "Electrical",
  "Compound Wall",
  "Staircase",
  "Terrace",
  "Finishing",
];

const defaultMaterialRates = [
  { material_name: "Cement", unit: "bag", rate: 382 },
  { material_name: "Steel", unit: "kg", rate: 61 },
  { material_name: "Sand", unit: "brass", rate: 3350 },
  { material_name: "Aggregate", unit: "m3", rate: 1450 },
  { material_name: "Brick", unit: "nos", rate: 9.5 },
  { material_name: "Paint", unit: "ltr", rate: 320 },
  { material_name: "Tile", unit: "sqft", rate: 72 },
];

const defaultLabourRates = [
  { labour_type: "Mason", unit: "day", rate: 950 },
  { labour_type: "Helper", unit: "day", rate: 650 },
  { labour_type: "Bar Bender", unit: "day", rate: 900 },
  { labour_type: "Carpenter", unit: "day", rate: 980 },
  { labour_type: "Painter", unit: "day", rate: 880 },
];

const roughModes = {
  Basic: 1700,
  Standard: 2300,
  Premium: 3000,
  Luxury: 3800,
};

const createMeasurementRow = (category = "Brickwork") =>
  calculateMeasurementRow({
    id: crypto.randomUUID(),
    category,
    description: `${category} Item`,
    length: 0,
    width: 0,
    height: 0,
    depth: 0,
    diameter: 0,
    quantity: 0,
    quantity_override: false,
    unit: "m3",
    formula: CATEGORY_FORMULAS[category] || "length*width*height",
    additions: 0,
    deductions: 0,
    wastage_percent: 0,
    rate: 0,
    amount: 0,
    note: "",
  });

export default function QSEstimatorPage() {
  const {
    project,
    versions,
    activeVersionId,
    measurements,
    boqItems,
    materialRates,
    labourRates,
    city,
    setProject,
    setVersions,
    setActiveVersionId,
    setMeasurements,
    setBoqItems,
    setMaterialRates,
    setLabourRates,
    setCity,
    pushUndoSnapshot,
    undoMeasurements,
    redoMeasurements,
  } = useQsStore();

  const [activeTab, setActiveTab] = useState("measurement");
  const [projectList, setProjectList] = useState([]);
  const [drawingFiles, setDrawingFiles] = useState([]);
  const [roughMode, setRoughMode] = useState("Standard");
  const [exportLogs, setExportLogs] = useState([]);
  const [loadingProject, setLoadingProject] = useState(false);
  const [roomCounts, setRoomCounts] = useState({ bedrooms: 2, bathrooms: 2, kitchens: 1, living_rooms: 1 });
  const [autoAssumptions, setAutoAssumptions] = useState(defaultAutoAssumptions);
  const [scheduleRows, setScheduleRows] = useState([]);
  const [weatherCity, setWeatherCity] = useState("Nashik");
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [manualComparisonMeta, setManualComparisonMeta] = useState({
    material_cost: "",
    labour_cost: "",
    total_cost: "",
    duration_days: "",
    manual_time_hours: "4",
  });
  const [manualCategoryRows, setManualCategoryRows] = useState([]);

  const totals = useMemo(() => calcTotals(measurements), [measurements]);
  const boqSummaryTotal = useMemo(
    () => boqItems.reduce((sum, item) => sum + Number(item.total || 0), 0),
    [boqItems],
  );

  const aiCategorySummary = useMemo(() => {
    const grouped = new Map();
    measurements.forEach((row) => {
      const existing = grouped.get(row.category) || { category: row.category, quantity: 0, amount: 0, unit: row.unit };
      existing.quantity += Number(row.quantity || 0);
      existing.amount += Number(row.amount || 0);
      grouped.set(row.category, existing);
    });
    return Array.from(grouped.values());
  }, [measurements]);

  const comparisonTableRows = useMemo(() => {
    const manualMap = new Map(manualCategoryRows.map((row) => [row.category, Number(row.manual_quantity || 0)]));
    return aiCategorySummary.map((item) => {
      const manualQuantity = manualMap.has(item.category) ? manualMap.get(item.category) : Number((item.quantity * 1.08).toFixed(4));
      const variance = item.quantity ? ((manualQuantity - item.quantity) / item.quantity) * 100 : 0;
      return {
        ...item,
        manual_quantity: manualQuantity,
        variance_pct: Number(variance.toFixed(2)),
      };
    });
  }, [aiCategorySummary, manualCategoryRows]);

  const comparisonSummary = useMemo(() => {
    const aiMaterial = totals.totalAmount * 0.62;
    const aiLabour = totals.totalAmount * 0.31;
    const manualMaterial = Number(manualComparisonMeta.material_cost || aiMaterial * 1.12);
    const manualLabour = Number(manualComparisonMeta.labour_cost || aiLabour * 1.1);
    const manualTotal = Number(manualComparisonMeta.total_cost || manualMaterial + manualLabour);
    const aiDuration = scheduleRows.reduce((sum, row) => sum + Number(row.days || 0), 0);
    const manualDuration = Number(manualComparisonMeta.duration_days || Math.max(aiDuration, aiDuration + 12));
    return {
      aiMaterial,
      aiLabour,
      aiTotal: totals.totalAmount,
      manualMaterial,
      manualLabour,
      manualTotal,
      savings: manualTotal - totals.totalAmount,
      savingsPct: manualTotal > 0 ? ((manualTotal - totals.totalAmount) / manualTotal) * 100 : 0,
      aiDuration,
      manualDuration,
      manualTimeHours: Number(manualComparisonMeta.manual_time_hours || 4),
    };
  }, [manualComparisonMeta, scheduleRows, totals.totalAmount]);

  const roughEstimate = useMemo(() => {
    const area = Number(project.built_up_area || 0) * Number(project.floors || 1);
    const perSqft = roughModes[roughMode];
    const total = area * perSqft;
    return {
      area,
      perSqft,
      materialCost: total * 0.62,
      labourCost: total * 0.31,
      total,
    };
  }, [project.built_up_area, project.floors, roughMode]);

  const loadProjectMeta = useCallback(async () => {
    const response = await listQsProjectsApi();
    setProjectList(response.data || []);
  }, [setProjectList]);

  const loadRates = useCallback(async (cityName) => {
    const [materialResponse, labourResponse] = await Promise.all([
      listMaterialRatesApi(cityName),
      listLabourRatesApi(cityName),
    ]);
    const materialRows =
      materialResponse.data?.length
        ? materialResponse.data
        : defaultMaterialRates.map((item) => ({ ...item, id: crypto.randomUUID(), city: cityName }));
    const labourRows =
      labourResponse.data?.length
        ? labourResponse.data
        : defaultLabourRates.map((item) => ({ ...item, id: crypto.randomUUID(), city: cityName }));
    setMaterialRates(materialRows);
    setLabourRates(labourRows);
  }, [setLabourRates, setMaterialRates]);

  const loadVersionData = useCallback(async (versionId) => {
    if (!versionId) return;
    const [measurementResponse, boqResponse, logResponse] = await Promise.all([
      listQsMeasurementsApi(versionId),
      listQsBoqApi(versionId),
      listQsExportLogsApi(versionId),
    ]);
    setMeasurements((measurementResponse.data || []).map((row) => calculateMeasurementRow(row)));
    setBoqItems(boqResponse.data || []);
    setExportLogs(logResponse.data || []);
  }, [setBoqItems, setMeasurements]);

  const loadProjectVersions = useCallback(async (projectId) => {
    const response = await listQsProjectVersionsApi(projectId);
    const loadedVersions = response.data || [];
    setVersions(loadedVersions);
    if (loadedVersions.length) {
      setActiveVersionId(loadedVersions[0].id);
      await loadVersionData(loadedVersions[0].id);
    }
  }, [loadVersionData, setActiveVersionId, setVersions]);

  const loadWeatherForecast = useCallback(async (cityName = weatherCity) => {
    setWeatherLoading(true);
    try {
      const formatted = await weatherService.getDailyForecast(cityName);
      setWeatherData(formatted);
    } catch {
      setWeatherData({
        city: cityName,
        hasApiKey: false,
        provider: "openweathermap",
        message: "Weather service unavailable right now.",
        days: [],
      });
    } finally {
      setWeatherLoading(false);
    }
  }, [weatherCity]);

  useEffect(() => {
    const init = async () => {
      try {
        await loadProjectMeta();
        await loadRates(city);
        await loadWeatherForecast("Nashik");
      } catch {
        toast.error("Unable to load QS dashboard defaults.");
      }
    };
    init();
  }, [city, loadProjectMeta, loadRates, loadWeatherForecast]);

  useEffect(() => {
    setManualCategoryRows((previous) => {
      const previousMap = new Map(previous.map((item) => [item.category, item.manual_quantity]));
      return aiCategorySummary.map((item) => ({
        category: item.category,
        manual_quantity: previousMap.has(item.category)
          ? Number(previousMap.get(item.category))
          : Number((item.quantity * 1.08).toFixed(4)),
      }));
    });
  }, [aiCategorySummary]);

  const updateProjectField = (field, value) => setProject({ ...project, [field]: value });

  const onCreateProject = async () => {
    if (!project.project_name || !project.client_name) {
      toast.error("Project name and client name are required.");
      return;
    }

    setLoadingProject(true);
    try {
      const projectPayload = {
        project_name: project.project_name,
        client_name: project.client_name,
        location: project.location,
        built_up_area: Number(project.built_up_area || 0),
        floors: Number(project.floors || 1),
        construction_type: project.construction_type,
        rate_profile: project.rate_profile,
      };

      const projectResponse = await createQsProjectApi(projectPayload);
      setProject(projectResponse.data);

      const versionResponse = await createQsProjectVersionApi(projectResponse.data.id, {
        version_name: "Rev-1",
        revision_notes: "Initial project setup",
        drawing_files: drawingFiles,
      });

      setVersions([versionResponse.data]);
      setActiveVersionId(versionResponse.data.id);
      setMeasurements([]);
      setBoqItems([]);
      setExportLogs([]);
      await loadProjectMeta();
      toast.success("Project dashboard created.");
    } catch {
      toast.error("Unable to create project dashboard.");
    } finally {
      setLoadingProject(false);
    }
  };

  const onCreateRevision = async () => {
    if (!project.id) {
      toast.error("Create project first.");
      return;
    }

    try {
      const nextVersionNumber = versions.length + 1;
      const response = await createQsProjectVersionApi(project.id, {
        version_name: `Rev-${nextVersionNumber}`,
        revision_notes: "Revision generated from active scope",
        drawing_files: drawingFiles,
      });
      const nextVersions = [response.data, ...versions];
      setVersions(nextVersions);
      setActiveVersionId(response.data.id);
      toast.success("New revision created.");
    } catch {
      toast.error("Unable to create revision.");
    }
  };

  const onSelectProject = async (projectId) => {
    const selectedProject = projectList.find((item) => item.id === projectId);
    if (!selectedProject) return;
    setProject(selectedProject);
    setCity(selectedProject.location || "Nashik");
    try {
      await loadProjectVersions(projectId);
      await loadRates(selectedProject.location || "Nashik");
      toast.success("Project loaded.");
    } catch {
      toast.error("Unable to load selected project.");
    }
  };

  const onVersionChange = async (versionId) => {
    setActiveVersionId(versionId);
    await loadVersionData(versionId);
  };

  const onDrawingUpload = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const updated = [...drawingFiles, ...files.map((file) => `${file.name} (${file.type || "unknown"})`)];
    setDrawingFiles(updated);
  };

  const updateRoomCount = (field, value) => {
    setRoomCounts((previous) => ({ ...previous, [field]: Number(value || 0) }));
  };

  const updateAutoAssumption = (key, value) => {
    setAutoAssumptions((previous) => ({ ...previous, [key]: Number(value || 0) }));
  };

  const updateManualComparisonMeta = (field, value) => {
    setManualComparisonMeta((previous) => ({ ...previous, [field]: value }));
  };

  const updateManualCategoryQuantity = (category, value) => {
    setManualCategoryRows((previous) => {
      const hasRow = previous.some((item) => item.category === category);
      if (hasRow) {
        return previous.map((item) => (item.category === category ? { ...item, manual_quantity: Number(value || 0) } : item));
      }
      return [...previous, { category, manual_quantity: Number(value || 0) }];
    });
  };

  const onAutoGenerateFromBasicInputs = () => {
    const builtUpArea = Number(project.built_up_area || 0);
    if (builtUpArea <= 0) {
      toast.error("Enter valid built-up area before auto generation.");
      return;
    }

    const generated = generateSemiAutomaticEstimate({
      builtUpAreaSqft: builtUpArea,
      floors: Number(project.floors || 1),
      qualityLevel: project.rate_profile || "Standard",
      roomCounts,
      assumptions: autoAssumptions,
    });

    setMeasurements(generated.generatedRows);
    setBoqItems(buildBoqFromMeasurements(generated.generatedRows));
    setScheduleRows(generated.scheduleDays);
    setManualCategoryRows(
      generated.generatedRows.map((row) => ({
        category: row.category,
        manual_quantity: Number((Number(row.quantity || 0) * 1.08).toFixed(4)),
      })),
    );
    setActiveTab("measurement");
    toast.success("Semi-automatic measurement sheets generated.");
  };

  const updateMeasurementCell = (rowId, field, value) => {
    pushUndoSnapshot();
    const updated = measurements.map((row) => {
      if (row.id !== rowId) return row;
      const nextRow = { ...row, [field]: value };
      if (field === "category") {
        nextRow.formula = CATEGORY_FORMULAS[value] || nextRow.formula;
      }
      if (field === "quantity") {
        nextRow.quantity_override = true;
      }
      return calculateMeasurementRow(nextRow);
    });
    setMeasurements(updated);
  };

  const addMeasurementRow = (category = "Brickwork") => {
    pushUndoSnapshot();
    setMeasurements([...measurements, createMeasurementRow(category)]);
  };

  const duplicateMeasurementRow = (rowId) => {
    const row = measurements.find((item) => item.id === rowId);
    if (!row) return;
    pushUndoSnapshot();
    setMeasurements([...measurements, { ...row, id: crypto.randomUUID(), description: `${row.description} (Copy)` }]);
  };

  const removeMeasurementRow = (rowId) => {
    pushUndoSnapshot();
    setMeasurements(measurements.filter((row) => row.id !== rowId));
  };

  const regenerateBoq = () => {
    const generated = buildBoqFromMeasurements(measurements);
    setBoqItems(generated);
    toast.success("BOQ regenerated from measurement sheet.");
  };

  const addBoqRow = () => {
    const next = {
      id: crypto.randomUUID(),
      sr_no: boqItems.length + 1,
      section: "General",
      description: "Manual BOQ Line",
      qty: 0,
      unit: "m3",
      rate: 0,
      total: 0,
    };
    setBoqItems([...boqItems, next]);
  };

  const updateBoqCell = (rowId, field, value) => {
    const updated = boqItems.map((row) => {
      if (row.id !== rowId) return row;
      const next = { ...row, [field]: value };
      next.total = Number(next.qty || 0) * Number(next.rate || 0);
      return next;
    });
    setBoqItems(updated);
  };

  const saveMeasurements = async () => {
    if (!activeVersionId) {
      toast.error("Select or create a project version first.");
      return;
    }
    try {
      await upsertQsMeasurementsApi(activeVersionId, {
        items: measurements.map((row) => ({ ...row })),
      });
      toast.success("Measurement sheet saved.");
    } catch {
      toast.error("Unable to save measurement sheet.");
    }
  };

  const saveBoq = async () => {
    if (!activeVersionId) {
      toast.error("Select or create a project version first.");
      return;
    }
    try {
      await upsertQsBoqApi(activeVersionId, {
        items: boqItems.map((row, index) => ({ ...row, sr_no: index + 1 })),
      });
      toast.success("BOQ saved.");
    } catch {
      toast.error("Unable to save BOQ.");
    }
  };

  const saveRates = async () => {
    try {
      await upsertMaterialRatesApi(materialRates.map((row) => ({ ...row, city })));
      await upsertLabourRatesApi(labourRates.map((row) => ({ ...row, city })));
      toast.success("Rate database updated.");
    } catch {
      toast.error("Unable to save rate database.");
    }
  };

  const createExcelExport = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AI Estimate Pro";
    workbook.created = new Date();

    const applySheetHeader = (sheet, title) => {
      sheet.mergeCells("A1:H1");
      sheet.getCell("A1").value = title;
      sheet.getCell("A1").font = { bold: true, size: 13 };
      sheet.getCell("A1").alignment = { horizontal: "center" };
      sheet.getCell("A1").fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF1F5F9" },
      };
    };

    const summary = workbook.addWorksheet("ABSTRACT SUMMARY", { views: [{ state: "frozen", ySplit: 2 }] });
    applySheetHeader(summary, "Professional Civil Estimation Summary");
    summary.addRow(["Project Name", project.project_name]);
    summary.addRow(["Client", project.client_name]);
    summary.addRow(["Location", project.location]);
    summary.addRow(["Built-up Area", project.built_up_area]);
    summary.addRow(["Floors", project.floors]);
    summary.addRow(["Measurement Total", totals.totalAmount]);
    summary.addRow(["BOQ Total", boqSummaryTotal]);

    const boqSheet = workbook.addWorksheet("BOQ MASTER", { views: [{ state: "frozen", ySplit: 2 }] });
    applySheetHeader(boqSheet, "Bill of Quantities");
    boqSheet.columns = [
      { header: "Sr No", key: "sr_no", width: 10 },
      { header: "Section", key: "section", width: 22 },
      { header: "Description", key: "description", width: 32 },
      { header: "Quantity", key: "qty", width: 14 },
      { header: "Unit", key: "unit", width: 12 },
      { header: "Rate", key: "rate", width: 14 },
      { header: "Amount", key: "total", width: 16 },
    ];
    boqItems.forEach((item) => boqSheet.addRow(item));
    boqSheet.addRow({ description: "Grand Total", total: { formula: `SUM(G3:G${boqItems.length + 2})` } });

    const measurementSheet = workbook.addWorksheet("MEASUREMENT SHEET", { views: [{ state: "frozen", ySplit: 2 }] });
    applySheetHeader(measurementSheet, "Detailed Measurement Sheet");
    measurementSheet.columns = [
      { header: "Category", key: "category", width: 18 },
      { header: "Description", key: "description", width: 24 },
      { header: "Length", key: "length", width: 12 },
      { header: "Width", key: "width", width: 12 },
      { header: "Height", key: "height", width: 12 },
      { header: "Depth", key: "depth", width: 12 },
      { header: "Formula", key: "formula", width: 24 },
      { header: "Quantity", key: "quantity", width: 12 },
      { header: "Rate", key: "rate", width: 12 },
      { header: "Amount", key: "amount", width: 14 },
      { header: "Additions", key: "additions", width: 12 },
      { header: "Deductions", key: "deductions", width: 12 },
      { header: "Wastage %", key: "wastage_percent", width: 12 },
    ];
    measurements.forEach((item) => measurementSheet.addRow(item));

    const rccSheet = workbook.addWorksheet("RCC QUANTITY");
    applySheetHeader(rccSheet, "RCC Quantity Statement");
    rccSheet.addRow(["Description", "Quantity", "Unit"]);
    measurements
      .filter((item) => ["RCC", "Columns", "Beams", "Slabs"].includes(item.category))
      .forEach((item) => rccSheet.addRow([item.description, item.quantity, item.unit]));

    const steelSheet = workbook.addWorksheet("STEEL BBS");
    applySheetHeader(steelSheet, "Steel Bending Schedule");
    steelSheet.addRow(["Description", "Diameter", "Length", "Qty", "Unit"]);
    measurements
      .filter((item) => item.category === "Steel/BBS")
      .forEach((item) => steelSheet.addRow([item.description, item.diameter, item.length, item.quantity, item.unit]));

    const paintSheet = workbook.addWorksheet("PAINT CALC");
    applySheetHeader(paintSheet, "Paint and Surface Calculations");
    paintSheet.addRow(["Description", "Area", "Rate", "Amount"]);
    measurements
      .filter((item) => ["Paint", "Plaster"].includes(item.category))
      .forEach((item) => paintSheet.addRow([item.description, item.quantity, item.rate, item.amount]));

    const rateSheet = workbook.addWorksheet("RATE ANALYSIS");
    applySheetHeader(rateSheet, "Material and Labour Rate Analysis");
    rateSheet.addRow(["Material", "City", "Unit", "Rate"]);
    materialRates.forEach((item) => rateSheet.addRow([item.material_name, city, item.unit, item.rate]));
    rateSheet.addRow([]);
    rateSheet.addRow(["Labour Type", "City", "Unit", "Rate"]);
    labourRates.forEach((item) => rateSheet.addRow([item.labour_type, city, item.unit, item.rate]));

    const materialSummary = workbook.addWorksheet("MATERIAL SUMMARY");
    applySheetHeader(materialSummary, "Material Quantity and Cost Summary");
    materialSummary.addRow(["Description", "Quantity", "Amount"]);
    measurements.forEach((item) => materialSummary.addRow([item.description, item.quantity, item.amount]));

    const abstractCost = workbook.addWorksheet("ABSTRACT COST");
    applySheetHeader(abstractCost, "Abstract Cost Statement");
    abstractCost.addRow(["Head", "Amount"]);
    abstractCost.addRow(["Measurement Total", totals.totalAmount]);
    abstractCost.addRow(["BOQ Total", boqSummaryTotal]);
    abstractCost.addRow(["Rough Estimate", roughEstimate.total]);

    const scheduleSheet = workbook.addWorksheet("EXECUTION SCHEDULE");
    applySheetHeader(scheduleSheet, "Auto Generated Construction Schedule");
    scheduleSheet.addRow(["Phase", "Days", "Weeks"]);
    scheduleRows.forEach((phase) => {
      scheduleSheet.addRow([phase.phase, phase.days, Number((phase.days / 7).toFixed(1))]);
    });

    const comparisonSheet = workbook.addWorksheet("MANUAL VS AI");
    applySheetHeader(comparisonSheet, "Manual Contractor vs AI Estimate Comparison");
    comparisonSheet.addRow(["Category", "AI Quantity", "Manual Quantity", "Variance %"]);
    comparisonTableRows.forEach((row) => {
      comparisonSheet.addRow([row.category, row.quantity, row.manual_quantity, row.variance_pct]);
    });
    comparisonSheet.addRow([]);
    comparisonSheet.addRow(["AI Total", comparisonSummary.aiTotal]);
    comparisonSheet.addRow(["Manual Total", comparisonSummary.manualTotal]);
    comparisonSheet.addRow(["Savings", comparisonSummary.savings]);
    comparisonSheet.addRow(["Savings %", comparisonSummary.savingsPct]);

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.project_name || "qs-project"}-estimate.xlsx`);

    if (activeVersionId) {
      await createQsExportLogApi({ project_version_id: activeVersionId, export_type: "excel" });
      const logs = await listQsExportLogsApi(activeVersionId);
      setExportLogs(logs.data || []);
    }
  };

  const createPdfExport = async () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Professional Civil Estimation Report", 14, 18);
    doc.setFontSize(10);
    doc.text(`Project: ${project.project_name}`, 14, 26);
    doc.text(`Client: ${project.client_name}`, 14, 32);
    doc.text(`Location: ${project.location} | Floors: ${project.floors}`, 14, 38);

    autoTable(doc, {
      startY: 46,
      head: [["Sr", "Category", "Description", "Qty", "Unit", "Rate", "Amount"]],
      body: measurements.map((item, index) => [
        index + 1,
        item.category,
        item.description,
        formatNumber(item.quantity),
        item.unit,
        formatINR(item.rate),
        formatINR(item.amount),
      ]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Sr", "Section", "Description", "Qty", "Unit", "Rate", "Total"]],
      body: boqItems.map((item, index) => [index + 1, item.section, item.description, item.qty, item.unit, formatINR(item.rate), formatINR(item.total)]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Phase", "Days", "Weeks"]],
      body: scheduleRows.map((row) => [row.phase, String(row.days), (row.days / 7).toFixed(1)]),
    });

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Category", "AI Qty", "Manual Qty", "Variance %"]],
      body: comparisonTableRows.map((row) => [
        row.category,
        formatNumber(row.quantity),
        formatNumber(row.manual_quantity),
        `${row.variance_pct}%`,
      ]),
    });

    doc.text(`Total Measurement Amount: ${formatINR(totals.totalAmount)}`, 14, doc.lastAutoTable.finalY + 12);
    doc.text(`Total BOQ Amount: ${formatINR(boqSummaryTotal)}`, 14, doc.lastAutoTable.finalY + 18);
    doc.text("Prepared by: _____________________", 14, doc.lastAutoTable.finalY + 28);
    doc.text("Approved by: _____________________", 110, doc.lastAutoTable.finalY + 28);

    doc.save(`${project.project_name || "qs-project"}-estimate.pdf`);

    if (activeVersionId) {
      await createQsExportLogApi({ project_version_id: activeVersionId, export_type: "pdf" });
      const logs = await listQsExportLogsApi(activeVersionId);
      setExportLogs(logs.data || []);
    }
  };

  const tabButton = (key, label) => (
    <button
      type="button"
      onClick={() => setActiveTab(key)}
      className={`rounded-full px-4 py-2 text-sm transition-colors duration-200 ${
        activeTab === key ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
      }`}
      data-testid={`qs-tab-${key}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 reveal-up" data-testid="qs-estimator-page">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="qs-dashboard-header">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="qs-dashboard-title">
          Professional QS + BOQ Estimation Studio
        </h1>
        <p className="text-sm text-slate-600 md:text-base" data-testid="qs-dashboard-subtitle">
          Dynamic measurement sheets, formula-driven recalculation, deduction engine, BOQ workflow and export-ready civil estimation.
        </p>
      </section>

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-project-dashboard-card">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="qs-project-dashboard-title">Project Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input value={project.project_name} onChange={(e) => updateProjectField("project_name", e.target.value)} placeholder="Project name" data-testid="qs-project-name-input" />
            <Input value={project.client_name} onChange={(e) => updateProjectField("client_name", e.target.value)} placeholder="Client details" data-testid="qs-client-name-input" />
            <Input value={project.location} onChange={(e) => updateProjectField("location", e.target.value)} placeholder="Site location" data-testid="qs-location-input" />
            <Input type="number" value={project.built_up_area} onChange={(e) => updateProjectField("built_up_area", e.target.value)} placeholder="Built-up area" data-testid="qs-built-up-area-input" />
            <Input type="number" value={project.floors} onChange={(e) => updateProjectField("floors", e.target.value)} placeholder="Number of floors" data-testid="qs-floors-input" />
            <Input value={project.construction_type} onChange={(e) => updateProjectField("construction_type", e.target.value)} placeholder="Construction type" data-testid="qs-construction-type-input" />
            <Select value={project.rate_profile || "Standard"} onValueChange={(value) => updateProjectField("rate_profile", value)}>
              <SelectTrigger data-testid="qs-quality-level-select">
                <SelectValue placeholder="Quality level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Basic">Basic</SelectItem>
                <SelectItem value="Standard">Standard</SelectItem>
                <SelectItem value="Premium">Premium</SelectItem>
                <SelectItem value="Luxury">Luxury</SelectItem>
              </SelectContent>
            </Select>
            <Input type="file" multiple onChange={onDrawingUpload} data-testid="qs-drawing-upload-input" />
            <Select value={project.id || ""} onValueChange={onSelectProject}>
              <SelectTrigger data-testid="qs-existing-project-select">
                <SelectValue placeholder="Load existing project" />
              </SelectTrigger>
              <SelectContent>
                {projectList.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.project_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2" data-testid="qs-project-actions">
            <Button onClick={onCreateProject} disabled={loadingProject} data-testid="qs-create-project-button"><Save size={16} /> {loadingProject ? "Saving..." : "Create Project"}</Button>
            <Button variant="secondary" onClick={onCreateRevision} data-testid="qs-create-revision-button"><Plus size={16} /> New Revision</Button>
            <Button variant="default" onClick={onAutoGenerateFromBasicInputs} data-testid="qs-auto-generate-button">Auto Generate Estimate</Button>
            <Select value={activeVersionId} onValueChange={onVersionChange}>
              <SelectTrigger className="w-[220px]" data-testid="qs-version-select-trigger">
                <SelectValue placeholder="Select revision" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((version) => (
                  <SelectItem key={version.id} value={version.id}>{version.version_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="qs-meta-panels">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="qs-drawing-files-panel">
              <p className="mb-2 text-sm font-medium text-slate-700">Drawing Attachments (PDF/Image/DWG metadata)</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {drawingFiles.map((file, index) => <li key={`${file}-${index}`}>• {file}</li>)}
                {!drawingFiles.length ? <li>No drawings attached yet.</li> : null}
              </ul>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="qs-revision-history-panel">
              <p className="mb-2 text-sm font-medium text-slate-700">Project Revision History</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {versions.map((version) => (
                  <li key={version.id}>• {version.version_name} — {new Date(version.created_at).toLocaleString("en-IN")}</li>
                ))}
                {!versions.length ? <li>No revisions yet.</li> : null}
              </ul>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="qs-room-count-panel">
              <p className="mb-2 text-sm font-medium text-slate-700">Optional Room Counts (auto generation)</p>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={roomCounts.bedrooms} onChange={(e) => updateRoomCount("bedrooms", e.target.value)} placeholder="Bedrooms" data-testid="qs-room-bedrooms-input" />
                <Input type="number" value={roomCounts.bathrooms} onChange={(e) => updateRoomCount("bathrooms", e.target.value)} placeholder="Bathrooms" data-testid="qs-room-bathrooms-input" />
                <Input type="number" value={roomCounts.kitchens} onChange={(e) => updateRoomCount("kitchens", e.target.value)} placeholder="Kitchens" data-testid="qs-room-kitchens-input" />
                <Input type="number" value={roomCounts.living_rooms} onChange={(e) => updateRoomCount("living_rooms", e.target.value)} placeholder="Living rooms" data-testid="qs-room-living-input" />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="qs-assumptions-panel">
              <p className="mb-2 text-sm font-medium text-slate-700">Engineering Assumptions (editable)</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(autoAssumptions).map(([key, value]) => (
                  <div key={key}>
                    <label className="text-xs text-slate-500">{key}</label>
                    <Input type="number" value={value} onChange={(e) => updateAutoAssumption(key, e.target.value)} data-testid={`qs-assumption-${key}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" data-testid="qs-tab-navigation">
        {tabButton("measurement", "Measurement Sheets")}
        {tabButton("boq", "BOQ Generator")}
        {tabButton("schedule", "Schedule")}
        {tabButton("comparison", "Manual vs AI")}
        {tabButton("rates", "Rate Database")}
        {tabButton("rough", "Rough Estimate")}
        {tabButton("weather", "India Weather")}
        {tabButton("exports", "Exports")}
      </div>

      {activeTab === "measurement" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-measurement-sheet-card">
          <CardHeader>
            <CardTitle className="text-2xl">Dynamic Measurement Sheets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" data-testid="qs-measurement-actions">
              <Button onClick={() => addMeasurementRow("Brickwork")} data-testid="qs-add-row-button"><Plus size={14} /> Add Row</Button>
              <Button variant="secondary" onClick={undoMeasurements} data-testid="qs-undo-button"><Undo2 size={14} /> Undo</Button>
              <Button variant="secondary" onClick={redoMeasurements} data-testid="qs-redo-button"><Redo2 size={14} /> Redo</Button>
              <Button variant="outline" onClick={regenerateBoq} data-testid="qs-regenerate-boq-button">Regenerate BOQ</Button>
              <Button variant="outline" onClick={saveMeasurements} data-testid="qs-save-measurements-button"><Save size={14} /> Save Measurements</Button>
            </div>

            <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200" data-testid="qs-measurement-table-wrapper">
              <Table data-testid="qs-measurement-table">
                <TableHeader className="sticky top-0 bg-slate-100">
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>L</TableHead>
                    <TableHead>W</TableHead>
                    <TableHead>H</TableHead>
                    <TableHead>D</TableHead>
                    <TableHead>Ø</TableHead>
                    <TableHead>Formula</TableHead>
                    <TableHead>Add</TableHead>
                    <TableHead>Deduct</TableHead>
                    <TableHead>Wst%</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {measurements.map((row) => (
                    <TableRow key={row.id} data-testid={`qs-measurement-row-${row.id}`}>
                      <TableCell>
                        <Select value={row.category} onValueChange={(value) => updateMeasurementCell(row.id, "category", value)}>
                          <SelectTrigger className="w-[140px]" data-testid={`qs-row-category-${row.id}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {categories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input value={row.description} onChange={(e) => updateMeasurementCell(row.id, "description", e.target.value)} data-testid={`qs-row-description-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.length} onChange={(e) => updateMeasurementCell(row.id, "length", e.target.value)} data-testid={`qs-row-length-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.width} onChange={(e) => updateMeasurementCell(row.id, "width", e.target.value)} data-testid={`qs-row-width-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.height} onChange={(e) => updateMeasurementCell(row.id, "height", e.target.value)} data-testid={`qs-row-height-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.depth} onChange={(e) => updateMeasurementCell(row.id, "depth", e.target.value)} data-testid={`qs-row-depth-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.diameter} onChange={(e) => updateMeasurementCell(row.id, "diameter", e.target.value)} data-testid={`qs-row-diameter-${row.id}`} /></TableCell>
                      <TableCell><Input value={row.formula} onChange={(e) => updateMeasurementCell(row.id, "formula", e.target.value)} data-testid={`qs-row-formula-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.additions} onChange={(e) => updateMeasurementCell(row.id, "additions", e.target.value)} data-testid={`qs-row-additions-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.deductions} onChange={(e) => updateMeasurementCell(row.id, "deductions", e.target.value)} data-testid={`qs-row-deductions-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.wastage_percent} onChange={(e) => updateMeasurementCell(row.id, "wastage_percent", e.target.value)} data-testid={`qs-row-wastage-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.quantity} onChange={(e) => updateMeasurementCell(row.id, "quantity", e.target.value)} data-testid={`qs-row-quantity-${row.id}`} /></TableCell>
                      <TableCell><Input value={row.unit} onChange={(e) => updateMeasurementCell(row.id, "unit", e.target.value)} data-testid={`qs-row-unit-${row.id}`} /></TableCell>
                      <TableCell><Input type="number" value={row.rate} onChange={(e) => updateMeasurementCell(row.id, "rate", e.target.value)} data-testid={`qs-row-rate-${row.id}`} /></TableCell>
                      <TableCell className="font-mono" data-testid={`qs-row-amount-${row.id}`}>{formatINR(row.amount)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="outline" onClick={() => duplicateMeasurementRow(row.id)} data-testid={`qs-row-duplicate-${row.id}`}><Plus size={14} /></Button>
                          <Button size="icon" variant="outline" onClick={() => removeMeasurementRow(row.id)} data-testid={`qs-row-remove-${row.id}`}><Trash2 size={14} /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="qs-measurement-totals-grid">
              <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-total-quantity-card"><p className="text-xs text-slate-500">Total Quantity</p><p className="font-mono text-lg">{formatNumber(totals.totalQuantity)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-total-amount-card"><p className="text-xs text-slate-500">Measurement Total</p><p className="font-mono text-lg">{formatINR(totals.totalAmount)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-boq-total-card"><p className="text-xs text-slate-500">BOQ Total</p><p className="font-mono text-lg">{formatINR(boqSummaryTotal)}</p></div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "boq" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-boq-card">
          <CardHeader>
            <CardTitle className="text-2xl">Professional BOQ Generator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2" data-testid="qs-boq-actions">
              <Button onClick={regenerateBoq} data-testid="qs-boq-regenerate-button">Generate from Measurement</Button>
              <Button variant="secondary" onClick={addBoqRow} data-testid="qs-boq-add-row-button"><Plus size={14} /> Add BOQ Line</Button>
              <Button variant="outline" onClick={saveBoq} data-testid="qs-boq-save-button"><Save size={14} /> Save BOQ</Button>
            </div>
            <Table data-testid="qs-boq-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Sr No</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boqItems.map((row, index) => (
                  <TableRow key={row.id} data-testid={`qs-boq-row-${row.id}`}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell><Input value={row.section} onChange={(e) => updateBoqCell(row.id, "section", e.target.value)} data-testid={`qs-boq-section-${row.id}`} /></TableCell>
                    <TableCell><Input value={row.description} onChange={(e) => updateBoqCell(row.id, "description", e.target.value)} data-testid={`qs-boq-description-${row.id}`} /></TableCell>
                    <TableCell><Input type="number" value={row.qty} onChange={(e) => updateBoqCell(row.id, "qty", e.target.value)} data-testid={`qs-boq-qty-${row.id}`} /></TableCell>
                    <TableCell><Input value={row.unit} onChange={(e) => updateBoqCell(row.id, "unit", e.target.value)} data-testid={`qs-boq-unit-${row.id}`} /></TableCell>
                    <TableCell><Input type="number" value={row.rate} onChange={(e) => updateBoqCell(row.id, "rate", e.target.value)} data-testid={`qs-boq-rate-${row.id}`} /></TableCell>
                    <TableCell className="font-mono" data-testid={`qs-boq-total-${row.id}`}>{formatINR(row.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-boq-summary-total">
              <p className="text-sm text-slate-600">Section summary total</p>
              <p className="font-mono text-lg">{formatINR(boqSummaryTotal)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "rates" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-rate-database-card">
          <CardHeader>
            <CardTitle className="text-2xl">Editable Rate Database</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input value={city} onChange={(e) => setCity(e.target.value)} className="w-[200px]" data-testid="qs-rate-city-input" />
              <Button onClick={() => loadRates(city)} variant="secondary" data-testid="qs-rate-load-button">Load City Rates</Button>
              <Button onClick={saveRates} data-testid="qs-rate-save-button">Save Rates</Button>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div data-testid="qs-material-rates-section">
                <p className="mb-2 text-sm font-medium">Material Rates</p>
                <Table data-testid="qs-material-rates-table">
                  <TableHeader>
                    <TableRow><TableHead>Material</TableHead><TableHead>Unit</TableHead><TableHead>Rate</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialRates.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell><Input value={row.material_name} onChange={(e) => setMaterialRates(materialRates.map((r) => r.id === row.id ? { ...r, material_name: e.target.value } : r))} data-testid={`qs-material-name-${row.id}`} /></TableCell>
                        <TableCell><Input value={row.unit} onChange={(e) => setMaterialRates(materialRates.map((r) => r.id === row.id ? { ...r, unit: e.target.value } : r))} data-testid={`qs-material-unit-${row.id}`} /></TableCell>
                        <TableCell><Input type="number" value={row.rate} onChange={(e) => setMaterialRates(materialRates.map((r) => r.id === row.id ? { ...r, rate: Number(e.target.value) } : r))} data-testid={`qs-material-rate-${row.id}`} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div data-testid="qs-labour-rates-section">
                <p className="mb-2 text-sm font-medium">Labour Rates</p>
                <Table data-testid="qs-labour-rates-table">
                  <TableHeader>
                    <TableRow><TableHead>Labour Type</TableHead><TableHead>Unit</TableHead><TableHead>Rate</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {labourRates.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell><Input value={row.labour_type} onChange={(e) => setLabourRates(labourRates.map((r) => r.id === row.id ? { ...r, labour_type: e.target.value } : r))} data-testid={`qs-labour-type-${row.id}`} /></TableCell>
                        <TableCell><Input value={row.unit} onChange={(e) => setLabourRates(labourRates.map((r) => r.id === row.id ? { ...r, unit: e.target.value } : r))} data-testid={`qs-labour-unit-${row.id}`} /></TableCell>
                        <TableCell><Input type="number" value={row.rate} onChange={(e) => setLabourRates(labourRates.map((r) => r.id === row.id ? { ...r, rate: Number(e.target.value) } : r))} data-testid={`qs-labour-rate-${row.id}`} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "rough" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-rough-estimate-card">
          <CardHeader>
            <CardTitle className="text-2xl">Rough Estimate Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={roughMode} onValueChange={setRoughMode}>
              <SelectTrigger className="w-[220px]" data-testid="qs-rough-mode-select">
                <SelectValue placeholder="Choose estimate mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Basic">Basic</SelectItem>
                <SelectItem value="Standard">Standard</SelectItem>
                <SelectItem value="Premium">Premium</SelectItem>
                <SelectItem value="Luxury">Luxury</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4" data-testid="qs-rough-estimate-grid">
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Built-up Area</p><p className="font-mono">{formatNumber(roughEstimate.area, 0)} sqft</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Rate/Sqft</p><p className="font-mono">{formatINR(roughEstimate.perSqft)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Material Cost</p><p className="font-mono">{formatINR(roughEstimate.materialCost)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Labour Cost</p><p className="font-mono">{formatINR(roughEstimate.labourCost)}</p></div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3" data-testid="qs-rough-total-card">
              <p className="text-sm text-slate-600">Rough total estimate</p>
              <p className="font-mono text-xl text-slate-900">{formatINR(roughEstimate.total)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "schedule" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-schedule-card">
          <CardHeader>
            <CardTitle className="text-2xl">Auto Construction Schedule (Day + Week Views)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!scheduleRows.length ? (
              <p className="text-sm text-slate-600" data-testid="qs-schedule-empty-text">
                Run <strong>Auto Generate Estimate</strong> to produce schedule from project inputs.
              </p>
            ) : null}
            <Table data-testid="qs-schedule-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Phase</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Weeks (approx)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scheduleRows.map((row, index) => (
                  <TableRow key={`${row.phase}-${index}`} data-testid={`qs-schedule-row-${index}`}>
                    <TableCell>{row.phase}</TableCell>
                    <TableCell className="font-mono">{row.days}</TableCell>
                    <TableCell className="font-mono">{(row.days / 7).toFixed(1)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "comparison" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-manual-vs-ai-card">
          <CardHeader>
            <CardTitle className="text-2xl">Manual Contractor vs AI Estimate Comparison</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5" data-testid="qs-comparison-input-grid">
              <Input type="number" value={manualComparisonMeta.material_cost} onChange={(e) => updateManualComparisonMeta("material_cost", e.target.value)} placeholder="Manual material cost" data-testid="qs-manual-material-cost-input" />
              <Input type="number" value={manualComparisonMeta.labour_cost} onChange={(e) => updateManualComparisonMeta("labour_cost", e.target.value)} placeholder="Manual labour cost" data-testid="qs-manual-labour-cost-input" />
              <Input type="number" value={manualComparisonMeta.total_cost} onChange={(e) => updateManualComparisonMeta("total_cost", e.target.value)} placeholder="Manual total cost" data-testid="qs-manual-total-cost-input" />
              <Input type="number" value={manualComparisonMeta.duration_days} onChange={(e) => updateManualComparisonMeta("duration_days", e.target.value)} placeholder="Manual duration (days)" data-testid="qs-manual-duration-input" />
              <Input type="number" value={manualComparisonMeta.manual_time_hours} onChange={(e) => updateManualComparisonMeta("manual_time_hours", e.target.value)} placeholder="Manual takeoff time (hrs)" data-testid="qs-manual-time-hours-input" />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4" data-testid="qs-comparison-summary-grid">
              <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-comparison-ai-total"><p className="text-xs text-slate-500">AI Total</p><p className="font-mono">{formatINR(comparisonSummary.aiTotal)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-comparison-manual-total"><p className="text-xs text-slate-500">Manual Total</p><p className="font-mono">{formatINR(comparisonSummary.manualTotal)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-comparison-savings"><p className="text-xs text-slate-500">Savings by AI</p><p className="font-mono text-emerald-700">{formatINR(comparisonSummary.savings)}</p></div>
              <div className="rounded-lg bg-slate-50 p-3" data-testid="qs-comparison-savings-percent"><p className="text-xs text-slate-500">Savings %</p><p className="font-mono text-emerald-700">{comparisonSummary.savingsPct.toFixed(2)}%</p></div>
            </div>

            <Table data-testid="qs-comparison-detailed-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>AI Quantity</TableHead>
                  <TableHead>Manual Quantity</TableHead>
                  <TableHead>Variance %</TableHead>
                  <TableHead>Manual Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisonTableRows.map((row) => (
                  <TableRow key={row.category} data-testid={`qs-comparison-row-${row.category.toLowerCase().replace(/\s+/g, "-")}`}>
                    <TableCell>{row.category}</TableCell>
                    <TableCell className="font-mono">{formatNumber(row.quantity)}</TableCell>
                    <TableCell className="font-mono">{formatNumber(row.manual_quantity)}</TableCell>
                    <TableCell className={`font-mono ${row.variance_pct > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {row.variance_pct}%
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={row.manual_quantity}
                        onChange={(e) => updateManualCategoryQuantity(row.category, e.target.value)}
                        data-testid={`qs-comparison-manual-qty-${row.category.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="qs-comparison-time-grid">
              <div className="rounded-lg border border-slate-200 p-3" data-testid="qs-comparison-time-manual">
                <p className="text-sm text-slate-600">Manual estimation time</p>
                <p className="font-mono text-lg">{comparisonSummary.manualTimeHours.toFixed(1)} hours</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3" data-testid="qs-comparison-time-ai">
                <p className="text-sm text-slate-600">AI estimation time</p>
                <p className="font-mono text-lg">10 - 20 seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "weather" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-weather-card">
          <CardHeader>
            <CardTitle className="text-2xl">Indian Weather Forecast (OpenWeather)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" data-testid="qs-weather-actions">
              <Input value={weatherCity} onChange={(e) => setWeatherCity(e.target.value)} className="w-[260px]" data-testid="qs-weather-city-input" placeholder="City (India)" />
              <Button onClick={() => loadWeatherForecast(weatherCity)} data-testid="qs-weather-fetch-button">Fetch Forecast</Button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="qs-weather-status-panel">
              <p className="text-sm text-slate-700" data-testid="qs-weather-status-text">
                {weatherLoading ? "Loading weather forecast..." : weatherData?.message || "Weather forecast ready."}
              </p>
              {!weatherData?.hasApiKey ? (
                <p className="mt-1 text-xs text-amber-700" data-testid="qs-weather-missing-key-text">
                  Missing API key. Add <code>OPENWEATHER_API_KEY</code> in backend .env to enable live data.
                </p>
              ) : null}
            </div>

            <Table data-testid="qs-weather-forecast-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Temp (Min/Max)</TableHead>
                  <TableHead>Rainfall</TableHead>
                  <TableHead>Humidity</TableHead>
                  <TableHead>Wind</TableHead>
                  <TableHead>Condition</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(weatherData?.days || []).map((day) => (
                  <TableRow key={day.date} data-testid={`qs-weather-day-${day.date}`}>
                    <TableCell>{day.date}</TableCell>
                    <TableCell className="font-mono">{day.minTempC}°C / {day.maxTempC}°C</TableCell>
                    <TableCell className="font-mono">{day.rainfallMm} mm</TableCell>
                    <TableCell className="font-mono">{day.avgHumidity}%</TableCell>
                    <TableCell className="font-mono">{day.avgWindMps} m/s</TableCell>
                    <TableCell>{day.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {activeTab === "exports" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-export-card">
          <CardHeader>
            <CardTitle className="text-2xl">Excel + PDF Export Workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" data-testid="qs-export-actions">
              <Button onClick={createExcelExport} data-testid="qs-export-excel-button"><FileSpreadsheet size={16} /> Export Excel</Button>
              <Button variant="secondary" onClick={createPdfExport} data-testid="qs-export-pdf-button"><FileText size={16} /> Export PDF</Button>
              <Button variant="outline" onClick={() => loadVersionData(activeVersionId)} data-testid="qs-refresh-export-logs-button"><Download size={16} /> Refresh Export Logs</Button>
            </div>

            <Table data-testid="qs-export-log-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Export Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exportLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`qs-export-log-row-${log.id}`}>
                    <TableCell>{log.export_type}</TableCell>
                    <TableCell>{log.project_version_id}</TableCell>
                    <TableCell>{new Date(log.created_at).toLocaleString("en-IN")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}