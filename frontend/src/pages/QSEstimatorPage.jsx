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
import {
  BASIC_RATES,
  PROJECT_PRESETS,
  buildAbstract,
  buildDetailedBoqBySection,
} from "@/utils/qsAbstractTemplate";
import { formatINR, formatNumber } from "@/utils/formatters";

const BASIC_RATES_STORAGE_PREFIX = "ai_estimate_pro_basic_rates_";

const loadBasicRatesForProject = (projectId) => {
  if (!projectId) return BASIC_RATES.map((row) => ({ ...row }));
  try {
    const raw = localStorage.getItem(`${BASIC_RATES_STORAGE_PREFIX}${projectId}`);
    if (!raw) return BASIC_RATES.map((row) => ({ ...row }));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== BASIC_RATES.length) {
      return BASIC_RATES.map((row) => ({ ...row }));
    }
    return parsed;
  } catch {
    return BASIC_RATES.map((row) => ({ ...row }));
  }
};

const saveBasicRatesForProject = (projectId, rates) => {
  if (!projectId) return;
  try {
    localStorage.setItem(`${BASIC_RATES_STORAGE_PREFIX}${projectId}`, JSON.stringify(rates));
  } catch {
    // ignore storage errors
  }
};

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

// Default rates aligned to Feb 2026 Indian market (Nashik benchmark).
// All rates are user-editable; UI exposes them in the Rate Database tab.
const defaultMaterialRates = [
  { material_name: "Cement (OPC 53 grade)", unit: "bag (50kg)", rate: 410 },
  { material_name: "Cement (PPC)", unit: "bag (50kg)", rate: 380 },
  { material_name: "TMT Steel Fe-500", unit: "kg", rate: 68 },
  { material_name: "TMT Steel Fe-550D", unit: "kg", rate: 72 },
  { material_name: "River Sand", unit: "brass (100 cft)", rate: 6800 },
  { material_name: "M-Sand", unit: "brass (100 cft)", rate: 4200 },
  { material_name: "Plaster Sand (M-Sand)", unit: "brass (100 cft)", rate: 5400 },
  { material_name: "Coarse Aggregate 20mm", unit: "brass (100 cft)", rate: 5800 },
  { material_name: "Coarse Aggregate 12mm", unit: "brass (100 cft)", rate: 6200 },
  { material_name: "Red Brick (1st class)", unit: "nos", rate: 11 },
  { material_name: "Fly Ash Brick", unit: "nos", rate: 8.5 },
  { material_name: "AAC Block 200mm", unit: "nos", rate: 78 },
  { material_name: "Solid Concrete Block 200mm", unit: "nos", rate: 56 },
  { material_name: "Vitrified Tile (2x2)", unit: "sqft", rate: 95 },
  { material_name: "Granite Flooring", unit: "sqft", rate: 220 },
  { material_name: "Marble Flooring", unit: "sqft", rate: 180 },
  { material_name: "Emulsion Paint (Premium)", unit: "ltr", rate: 380 },
  { material_name: "Distemper Paint", unit: "ltr", rate: 145 },
  { material_name: "Exterior Apex Paint", unit: "ltr", rate: 410 },
  { material_name: "Waterproofing (Liquid)", unit: "kg", rate: 280 },
  { material_name: "RMC M25", unit: "m3 (cum)", rate: 6200 },
  { material_name: "RMC M30", unit: "m3 (cum)", rate: 6700 },
];

const defaultLabourRates = [
  { labour_type: "Mason (Skilled)", unit: "day", rate: 1100 },
  { labour_type: "Mason (Helper / Unskilled)", unit: "day", rate: 700 },
  { labour_type: "Bar Bender", unit: "day", rate: 1050 },
  { labour_type: "Carpenter (Shuttering)", unit: "day", rate: 1150 },
  { labour_type: "Carpenter (Furniture)", unit: "day", rate: 1300 },
  { labour_type: "Painter", unit: "day", rate: 950 },
  { labour_type: "Plumber", unit: "day", rate: 1100 },
  { labour_type: "Electrician", unit: "day", rate: 1100 },
  { labour_type: "Tile Mason", unit: "day", rate: 1200 },
  { labour_type: "Welder", unit: "day", rate: 1050 },
  { labour_type: "Plaster Mason", unit: "day", rate: 1050 },
  { labour_type: "Site Supervisor", unit: "day", rate: 1500 },
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
  const [weatherApiKey, setWeatherApiKey] = useState(() => {
    try { return localStorage.getItem("ai_estimate_pro_owm_key") || ""; } catch { return ""; }
  });
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
  const [activePreset, setActivePreset] = useState("");
  const [basicRates, setBasicRates] = useState(() => BASIC_RATES.map((row) => ({ ...row })));

  // Load basic rates whenever the project changes (per-project persistence).
  useEffect(() => {
    setBasicRates(loadBasicRatesForProject(project.id));
  }, [project.id]);

  const updateBasicRateField = (sr, field, value) => {
    setBasicRates((prev) => {
      const next = prev.map((row) =>
        row.sr === sr ? { ...row, [field]: field === "rate" ? Number(value || 0) : value } : row,
      );
      saveBasicRatesForProject(project.id, next);
      return next;
    });
  };

  const resetBasicRatesToTemplate = () => {
    const fresh = BASIC_RATES.map((row) => ({ ...row }));
    setBasicRates(fresh);
    saveBasicRatesForProject(project.id, fresh);
    toast.success("Basic rates reset to template defaults.");
  };

  const applyPreset = useCallback((presetKey) => {
    const preset = PROJECT_PRESETS[presetKey];
    if (!preset) return;
    setActivePreset(presetKey);
    setProject({
      ...project,
      floors: preset.floors,
      construction_type: preset.construction_type,
      rate_profile: preset.rate_profile,
    });
    setRoomCounts({ ...roomCounts, ...preset.rooms });
    setAutoAssumptions((prev) => ({ ...prev, ...preset.assumptions }));
    toast.success(`${preset.label} preset applied. Update built-up area and click Auto Generate.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, roomCounts]);

  const totals = useMemo(() => calcTotals(measurements), [measurements]);
  const boqSummaryTotal = useMemo(
    () => boqItems.reduce((sum, item) => sum + Number(item.total || 0), 0),
    [boqItems],
  );
  const abstractData = useMemo(() => buildAbstract(measurements), [measurements]);
  const detailedTemplate = useMemo(
    () => buildDetailedBoqBySection(measurements, Number(project.floors || 1)),
    [measurements, project.floors],
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
    // Merge backend rates with defaults — backend rates take precedence by name,
    // but any default not present in backend is appended so new catalog entries appear.
    const backendMaterials = materialResponse.data || [];
    const materialNames = new Set(backendMaterials.map((m) => m.material_name));
    const missingMaterials = defaultMaterialRates
      .filter((m) => !materialNames.has(m.material_name))
      .map((item) => ({ ...item, id: crypto.randomUUID(), city: cityName }));
    const materialRows = backendMaterials.length
      ? [...backendMaterials, ...missingMaterials]
      : defaultMaterialRates.map((item) => ({ ...item, id: crypto.randomUUID(), city: cityName }));

    const backendLabour = labourResponse.data || [];
    const labourNames = new Set(backendLabour.map((l) => l.labour_type));
    const missingLabour = defaultLabourRates
      .filter((l) => !labourNames.has(l.labour_type))
      .map((item) => ({ ...item, id: crypto.randomUUID(), city: cityName }));
    const labourRows = backendLabour.length
      ? [...backendLabour, ...missingLabour]
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
      const formatted = await weatherService.getDailyForecast(cityName, weatherApiKey);
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
  }, [weatherCity, weatherApiKey]);

  const saveWeatherApiKey = (value) => {
    setWeatherApiKey(value);
    try {
      if (value) localStorage.setItem("ai_estimate_pro_owm_key", value);
      else localStorage.removeItem("ai_estimate_pro_owm_key");
    } catch {
      // Ignore storage errors (incognito mode, etc.)
    }
  };

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
    if (!measurements.length) {
      toast.error("No measurements yet. Click 'Auto Generate Estimate' or add rows manually before exporting.");
      return;
    }
    try {
      const workbook = new ExcelJS.Workbook();
    workbook.creator = "AI Estimate Pro";
    workbook.created = new Date();

    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
    const headerFont = { bold: true, color: { argb: "FFFFFFFF" } };
    const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    const subtotalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };

    const setRowStyle = (row, fill, font) => {
      row.eachCell((cell) => {
        if (fill) cell.fill = fill;
        if (font) cell.font = font;
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
    };

    const titleRow = (sheet, title, span = "A1:F1") => {
      sheet.mergeCells(span);
      const cell = sheet.getCell(span.split(":")[0]);
      cell.value = title;
      cell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getRow(1).height = 26;
    };

    // 1) PROJECT INFO
    const info = workbook.addWorksheet("PROJECT INFO");
    titleRow(info, "PROFESSIONAL CIVIL ESTIMATION REPORT", "A1:D1");
    info.addRow([]);
    info.addRow(["Project", project.project_name || "-"]);
    info.addRow(["Client", project.client_name || "-"]);
    info.addRow(["Location", project.location || "-"]);
    info.addRow(["Subject", "Civil Work - Tender Document"]);
    info.addRow(["Date", new Date().toLocaleDateString("en-IN")]);
    info.addRow(["Built-up Area (sqft)", Number(project.built_up_area || 0)]);
    info.addRow(["Floors", Number(project.floors || 1)]);
    info.addRow(["Construction Type", project.construction_type || "-"]);
    info.addRow(["Quality Profile", project.rate_profile || "Standard"]);
    info.getColumn(1).width = 28;
    info.getColumn(2).width = 40;

    // 2) SUMMARY - MAIN BUILDING (Abstract)
    const abstract = buildAbstract(measurements);
    const summary = workbook.addWorksheet("SUMMARY - Main Building");
    titleRow(summary, "SUMMARY - Main Building", "A1:C1");
    summary.addRow([]);
    const summaryHeaderRow = summary.addRow(["Sl.No.", "Description of work", "Amount (Rs.)"]);
    setRowStyle(summaryHeaderRow, headerFill, headerFont);
    abstract.main.forEach((row) => {
      const r = summary.addRow([row.code, row.description, Number(row.amount.toFixed(2))]);
      r.getCell(3).numFmt = "#,##0.00";
    });
    if (abstract.addendum.some((row) => row.amount > 0)) {
      const div = summary.addRow(["", "— Addendum (MEP / Doors / Finishing) —", ""]);
      setRowStyle(div, sectionFill, { italic: true });
      abstract.addendum.forEach((row) => {
        const r = summary.addRow([row.code, row.description, Number(row.amount.toFixed(2))]);
        r.getCell(3).numFmt = "#,##0.00";
      });
    }
    const totalRow = summary.addRow(["", "TOTAL", Number(abstract.grandTotal.toFixed(2))]);
    setRowStyle(totalRow, subtotalFill, { bold: true });
    totalRow.getCell(3).numFmt = "#,##0.00";
    summary.getColumn(1).width = 10;
    summary.getColumn(2).width = 50;
    summary.getColumn(3).width = 18;

    // 3) BASIC RATES (without GST)
    const basic = workbook.addWorksheet("BASIC RATES");
    titleRow(basic, "BASIC RATES (WITHOUT GST) — for Tender Reference", "A1:D1");
    basic.addRow([]);
    const basicHeaderRow = basic.addRow(["Sl.No.", "Description of item", "Rs.", "Unit"]);
    setRowStyle(basicHeaderRow, headerFill, headerFont);
    BASIC_RATES.forEach((_, i) => {
      const row = basicRates[i] || BASIC_RATES[i];
      const r = basic.addRow([row.sr, row.description, row.rate, row.unit]);
      r.getCell(3).numFmt = "#,##0.00";
    });
    basic.getColumn(1).width = 8;
    basic.getColumn(2).width = 50;
    basic.getColumn(3).width = 14;
    basic.getColumn(4).width = 16;

    // 4) DETAILED BOQ — Section by section with NOTES + floor-wise rows
    const detailed = buildDetailedBoqBySection(measurements, Number(project.floors || 1));
    const detailedSheet = workbook.addWorksheet("DETAILED BOQ");
    titleRow(detailedSheet, "DETAILED BILL OF QUANTITIES (Section A - N)", "A1:F1");
    detailedSheet.addRow([]);

    let runningSr = 1;
    detailed.forEach((section) => {
      if (!section.rows.length) return;
      const headRow = detailedSheet.addRow([`'${section.code}'`, section.title, "", "", "", ""]);
      detailedSheet.mergeCells(`B${headRow.number}:F${headRow.number}`);
      setRowStyle(headRow, headerFill, headerFont);
      headRow.getCell(2).font = { bold: true, color: { argb: "FFFFFFFF" } };

      if (section.notes.length) {
        const note = detailedSheet.addRow([
          "NOTE:",
          section.notes.map((n, i) => `${i + 1}. ${n}`).join("  \n"),
          "",
          "",
          "",
          "",
        ]);
        detailedSheet.mergeCells(`B${note.number}:F${note.number}`);
        note.getCell(2).alignment = { wrapText: true, vertical: "top" };
        setRowStyle(note, sectionFill);
      }

      const colHead = detailedSheet.addRow(["Sl.No.", "Description of Work", "Quantity", "UoM", "Rate (Rs.)", "Amount (Rs.)"]);
      setRowStyle(colHead, sectionFill, { bold: true });

      section.rows.forEach((row) => {
        const r = detailedSheet.addRow([
          runningSr++,
          row.description,
          Number(Number(row.quantity || 0).toFixed(4)),
          row.unit,
          Number(Number(row.rate || 0).toFixed(2)),
          Number(Number(row.amount || 0).toFixed(2)),
        ]);
        r.getCell(5).numFmt = "#,##0.00";
        r.getCell(6).numFmt = "#,##0.00";
      });
      const sub = detailedSheet.addRow(["", `Sub-Total (${section.code})`, "", "", "", Number(section.subtotal.toFixed(2))]);
      setRowStyle(sub, subtotalFill, { bold: true });
      sub.getCell(6).numFmt = "#,##0.00";
      detailedSheet.addRow([]);
    });

    const grand = detailedSheet.addRow(["", "GRAND TOTAL", "", "", "", Number(abstract.grandTotal.toFixed(2))]);
    setRowStyle(grand, headerFill, headerFont);
    grand.getCell(6).numFmt = "#,##0.00";

    detailedSheet.getColumn(1).width = 8;
    detailedSheet.getColumn(2).width = 50;
    detailedSheet.getColumn(3).width = 14;
    detailedSheet.getColumn(4).width = 10;
    detailedSheet.getColumn(5).width = 14;
    detailedSheet.getColumn(6).width = 18;

    // 5) Raw measurement sheet (for QS audit)
    const measurementSheet = workbook.addWorksheet("MEASUREMENT SHEET");
    titleRow(measurementSheet, "DETAILED MEASUREMENT SHEET (Audit Trail)", "A1:M1");
    measurementSheet.addRow([]);
    const mhead = measurementSheet.addRow([
      "Category",
      "Description",
      "L",
      "W",
      "H",
      "D",
      "Formula",
      "Add",
      "Deduct",
      "Wst%",
      "Qty",
      "Unit",
      "Rate",
      "Amount",
    ]);
    setRowStyle(mhead, headerFill, headerFont);
    measurements.forEach((item) => {
      const r = measurementSheet.addRow([
        item.category,
        item.description,
        item.length,
        item.width,
        item.height,
        item.depth,
        item.formula,
        item.additions,
        item.deductions,
        item.wastage_percent,
        item.quantity,
        item.unit,
        item.rate,
        item.amount,
      ]);
      r.getCell(13).numFmt = "#,##0.00";
      r.getCell(14).numFmt = "#,##0.00";
    });

    // 6) MANUAL vs AI
    const cmp = workbook.addWorksheet("MANUAL VS AI");
    titleRow(cmp, "MANUAL CONTRACTOR vs AI ESTIMATE COMPARISON", "A1:D1");
    cmp.addRow([]);
    const ch = cmp.addRow(["Category", "AI Quantity", "Manual Quantity", "Variance %"]);
    setRowStyle(ch, headerFill, headerFont);
    comparisonTableRows.forEach((row) => {
      cmp.addRow([row.category, row.quantity, row.manual_quantity, row.variance_pct]);
    });
    cmp.addRow([]);
    cmp.addRow(["AI Total", "", "", Number(comparisonSummary.aiTotal.toFixed(2))]);
    cmp.addRow(["Manual Total", "", "", Number(comparisonSummary.manualTotal.toFixed(2))]);
    cmp.addRow(["Savings", "", "", Number(comparisonSummary.savings.toFixed(2))]);
    cmp.addRow(["Savings %", "", "", Number(comparisonSummary.savingsPct.toFixed(2))]);
    cmp.getColumn(1).width = 22;
    cmp.getColumn(4).width = 18;

    // 7) EXECUTION SCHEDULE
    const sched = workbook.addWorksheet("EXECUTION SCHEDULE");
    titleRow(sched, "AUTO GENERATED CONSTRUCTION SCHEDULE", "A1:C1");
    sched.addRow([]);
    const sh = sched.addRow(["Phase", "Days", "Weeks (approx)"]);
    setRowStyle(sh, headerFill, headerFont);
    scheduleRows.forEach((phase) => {
      sched.addRow([phase.phase, phase.days, Number((phase.days / 7).toFixed(1))]);
    });
    sched.getColumn(1).width = 28;

    // 8) RATE DATABASE
    const rateSheet = workbook.addWorksheet("RATE ANALYSIS");
    titleRow(rateSheet, "MATERIAL & LABOUR RATE ANALYSIS", "A1:D1");
    rateSheet.addRow([]);
    const rh1 = rateSheet.addRow(["Material", "City", "Unit", "Rate"]);
    setRowStyle(rh1, headerFill, headerFont);
    materialRates.forEach((item) => rateSheet.addRow([item.material_name, city, item.unit, item.rate]));
    rateSheet.addRow([]);
    const rh2 = rateSheet.addRow(["Labour Type", "City", "Unit", "Rate"]);
    setRowStyle(rh2, headerFill, headerFont);
    labourRates.forEach((item) => rateSheet.addRow([item.labour_type, city, item.unit, item.rate]));

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `${project.project_name || "qs-project"}-estimate.xlsx`);
    toast.success("Excel report downloaded.");

    if (activeVersionId) {
      await createQsExportLogApi({ project_version_id: activeVersionId, export_type: "excel" });
      const logs = await listQsExportLogsApi(activeVersionId);
      setExportLogs(logs.data || []);
    }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Excel export failed:", err);
      toast.error("Excel export failed. Please refresh and try again.");
    }
  };

  const createPdfExport = async () => {
    if (!measurements.length) {
      toast.error("No measurements yet. Click 'Auto Generate Estimate' or add rows manually before exporting.");
      return;
    }
    try {
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const abstract = buildAbstract(measurements);
    const detailed = buildDetailedBoqBySection(measurements, Number(project.floors || 1));

    // Title block
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.text("PROFESSIONAL CIVIL ESTIMATION REPORT", 14, 14);
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(10);
    doc.text(`Project: ${project.project_name || "-"}`, 14, 30);
    doc.text(`Client: ${project.client_name || "-"}`, 14, 36);
    doc.text(`Location: ${project.location || "-"}`, 14, 42);
    doc.text(`Subject: Civil Work - Tender Document`, 110, 30);
    doc.text(`Date: ${new Date().toLocaleDateString("en-IN")}`, 110, 36);
    doc.text(`Built-up: ${formatNumber(Number(project.built_up_area || 0), 0)} sqft | Floors: ${project.floors || 1}`, 110, 42);

    // 1) SUMMARY - Main Building (Abstract)
    autoTable(doc, {
      startY: 50,
      head: [["Sl.No.", "Description of work", "Amount (Rs.)"]],
      body: [
        ...abstract.main.map((row) => [row.code, row.description, formatINR(row.amount)]),
        ...(abstract.addendum.some((r) => r.amount > 0)
          ? [
              [{ content: "— Addendum (MEP / Doors / Finishing) —", colSpan: 3, styles: { fillColor: [241, 245, 249], halign: "center", fontStyle: "italic" } }],
              ...abstract.addendum.map((row) => [row.code, row.description, formatINR(row.amount)]),
            ]
          : []),
        [
          { content: "TOTAL", colSpan: 2, styles: { fillColor: [254, 243, 199], fontStyle: "bold", halign: "right" } },
          { content: formatINR(abstract.grandTotal), styles: { fillColor: [254, 243, 199], fontStyle: "bold" } },
        ],
      ],
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 3 },
      didDrawPage: () => {
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("SUMMARY - Main Building", 14, 48);
        doc.setFont("helvetica", "normal");
      },
    });

    // 2) BASIC RATES (without GST)
    doc.addPage();
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("BASIC RATES (WITHOUT GST) — for Tender Reference", 14, 16);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: 22,
      head: [["Sl.No.", "Description of item", "Rs.", "Unit"]],
      body: basicRates.map((row) => [row.sr, row.description, formatINR(row.rate), row.unit]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      styles: { fontSize: 9, cellPadding: 3 },
    });

    // 3) Detailed BOQ — Section by section with NOTES
    let runningSr = 1;
    detailed.forEach((section) => {
      if (!section.rows.length) return;
      doc.addPage();
      doc.setFillColor(30, 41, 59);
      doc.rect(0, 0, pageW, 18, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.text(`'${section.code}'  ${section.title}`, 14, 12);
      doc.setTextColor(0, 0, 0);

      let yStart = 26;
      if (section.notes.length) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("NOTE:", 14, yStart);
        doc.setFont("helvetica", "normal");
        section.notes.forEach((note, idx) => {
          const lines = doc.splitTextToSize(`${idx + 1}. ${note}`, pageW - 28);
          doc.text(lines, 14, yStart + 5 + idx * 6);
        });
        yStart += 5 + section.notes.length * 6 + 4;
      }

      autoTable(doc, {
        startY: yStart,
        head: [["Sl.No.", "Description of Work", "Quantity", "UoM", "Rate (Rs.)", "Amount (Rs.)"]],
        body: [
          ...section.rows.map((row) => [
            runningSr++,
            row.description,
            formatNumber(row.quantity),
            row.unit,
            formatINR(row.rate),
            formatINR(row.amount),
          ]),
          [
            { content: `Sub-Total (${section.code})`, colSpan: 5, styles: { fillColor: [254, 243, 199], fontStyle: "bold", halign: "right" } },
            { content: formatINR(section.subtotal), styles: { fillColor: [254, 243, 199], fontStyle: "bold" } },
          ],
        ],
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 8, cellPadding: 2.5 },
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 80 },
          2: { cellWidth: 22 },
          3: { cellWidth: 16 },
          4: { cellWidth: 24 },
          5: { cellWidth: 28 },
        },
      });
    });

    // 4) Manual vs AI
    doc.addPage();
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("MANUAL CONTRACTOR vs AI ESTIMATE COMPARISON", 14, 16);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: 22,
      head: [["Category", "AI Qty", "Manual Qty", "Variance %"]],
      body: comparisonTableRows.map((row) => [
        row.category,
        formatNumber(row.quantity),
        formatNumber(row.manual_quantity),
        `${row.variance_pct}%`,
      ]),
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9 },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      body: [
        ["AI Total", formatINR(comparisonSummary.aiTotal)],
        ["Manual Total", formatINR(comparisonSummary.manualTotal)],
        ["Savings by AI", formatINR(comparisonSummary.savings)],
        ["Savings %", `${comparisonSummary.savingsPct.toFixed(2)}%`],
      ],
      styles: { fontSize: 10 },
    });

    // 5) Schedule
    if (scheduleRows.length) {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 8,
        head: [["Construction Phase", "Days", "Weeks (approx)"]],
        body: scheduleRows.map((row) => [row.phase, String(row.days), (row.days / 7).toFixed(1)]),
        headStyles: { fillColor: [30, 41, 59], textColor: 255 },
        styles: { fontSize: 9 },
      });
    }

    // Final grand total + signatures
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(`GRAND TOTAL: ${formatINR(abstract.grandTotal)}`, 14, doc.lastAutoTable.finalY + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Sample BOQ format aligned to Indian tender practice. All rates are without GST.", 14, doc.lastAutoTable.finalY + 24);
    doc.text("Prepared by: _____________________", 14, doc.lastAutoTable.finalY + 36);
    doc.text("Approved by: _____________________", 110, doc.lastAutoTable.finalY + 36);

    doc.save(`${project.project_name || "qs-project"}-estimate.pdf`);
    toast.success("PDF report downloaded.");

    if (activeVersionId) {
      await createQsExportLogApi({ project_version_id: activeVersionId, export_type: "pdf" });
      const logs = await listQsExportLogsApi(activeVersionId);
      setExportLogs(logs.data || []);
    }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("PDF export failed:", err);
      toast.error("PDF export failed. Please refresh and try again.");
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
            <Select value={activePreset} onValueChange={applyPreset}>
              <SelectTrigger className="w-[220px]" data-testid="qs-preset-select-trigger">
                <SelectValue placeholder="Apply preset profile" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PROJECT_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key} data-testid={`qs-preset-item-${key.toLowerCase().replace(/\s+/g, "-")}`}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        {tabButton("abstract", "Abstract & BOQ Template")}
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

      {activeTab === "abstract" ? (
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="qs-abstract-card">
          <CardHeader>
            <CardTitle className="text-2xl" data-testid="qs-abstract-title">Abstract & Section-wise BOQ Template</CardTitle>
            <p className="text-sm text-slate-600" data-testid="qs-abstract-subtitle">
              Aligned with the standard tender BOQ template (Sections A-J + addendum). Exports follow this structure exactly.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <section data-testid="qs-abstract-summary-section">
              <p className="mb-2 text-sm font-semibold text-slate-700">SUMMARY - Main Building</p>
              <Table data-testid="qs-abstract-summary-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sl.No.</TableHead>
                    <TableHead>Description of work</TableHead>
                    <TableHead className="text-right">Amount (Rs.)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {abstractData.main.map((row) => (
                    <TableRow key={row.code} data-testid={`qs-abstract-row-${row.code}`}>
                      <TableCell className="font-mono">{row.code}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell className="font-mono text-right">{formatINR(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                  {abstractData.addendum.some((r) => r.amount > 0) ? (
                    <>
                      <TableRow data-testid="qs-abstract-addendum-divider">
                        <TableCell colSpan={3} className="bg-slate-50 italic text-center text-xs">
                          — Addendum (MEP / Doors / Finishing) —
                        </TableCell>
                      </TableRow>
                      {abstractData.addendum.map((row) => (
                        <TableRow key={row.code} data-testid={`qs-abstract-row-${row.code}`}>
                          <TableCell className="font-mono">{row.code}</TableCell>
                          <TableCell>{row.description}</TableCell>
                          <TableCell className="font-mono text-right">{formatINR(row.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </>
                  ) : null}
                  <TableRow data-testid="qs-abstract-grand-total-row">
                    <TableCell colSpan={2} className="text-right font-semibold bg-amber-50">TOTAL</TableCell>
                    <TableCell className="font-mono text-right font-semibold bg-amber-50">
                      {formatINR(abstractData.grandTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>

            <section data-testid="qs-basic-rates-section">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700">BASIC RATES (WITHOUT GST) — Editable per Project</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500" data-testid="qs-basic-rates-saved-hint">
                    {project.id ? "Saved per project (browser)" : "Save project to persist edits"}
                  </span>
                  <Button variant="outline" size="sm" onClick={resetBasicRatesToTemplate} data-testid="qs-basic-rates-reset-button">
                    Reset to template
                  </Button>
                </div>
              </div>
              <Table data-testid="qs-basic-rates-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Sl.No.</TableHead>
                    <TableHead>Description of item</TableHead>
                    <TableHead className="text-right">Rs.</TableHead>
                    <TableHead>Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {basicRates.map((row) => (
                    <TableRow key={row.sr} data-testid={`qs-basic-rate-row-${row.sr}`}>
                      <TableCell className="font-mono">{row.sr}</TableCell>
                      <TableCell>
                        <Input
                          value={row.description}
                          onChange={(e) => updateBasicRateField(row.sr, "description", e.target.value)}
                          data-testid={`qs-basic-rate-description-${row.sr}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={row.rate}
                          onChange={(e) => updateBasicRateField(row.sr, "rate", e.target.value)}
                          className="text-right font-mono"
                          data-testid={`qs-basic-rate-rate-${row.sr}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={row.unit}
                          onChange={(e) => updateBasicRateField(row.sr, "unit", e.target.value)}
                          data-testid={`qs-basic-rate-unit-${row.sr}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section data-testid="qs-detailed-template-section" className="space-y-4">
              <p className="text-sm font-semibold text-slate-700">DETAILED BOQ — Section A to N (with NOTES + floor-wise rows)</p>
              {detailedTemplate.map((section) => (
                <div key={section.code} className="rounded-lg border border-slate-200" data-testid={`qs-section-${section.code}`}>
                  <div className="bg-slate-900 px-3 py-2 text-white">
                    <p className="text-sm font-semibold">'{section.code}'  {section.title}</p>
                  </div>
                  {section.notes.length ? (
                    <div className="bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid={`qs-section-notes-${section.code}`}>
                      <p className="font-semibold">NOTE:</p>
                      <ul className="list-decimal pl-5">
                        {section.notes.map((note, idx) => <li key={idx}>{note}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {section.rows.length ? (
                    <Table data-testid={`qs-section-table-${section.code}`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description of Work</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>UoM</TableHead>
                          <TableHead className="text-right">Rate (Rs.)</TableHead>
                          <TableHead className="text-right">Amount (Rs.)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.rows.map((row, idx) => (
                          <TableRow key={`${section.code}-${idx}`} data-testid={`qs-section-row-${section.code}-${idx}`}>
                            <TableCell>{row.description}</TableCell>
                            <TableCell className="font-mono text-right">{formatNumber(row.quantity)}</TableCell>
                            <TableCell>{row.unit}</TableCell>
                            <TableCell className="font-mono text-right">{formatINR(row.rate)}</TableCell>
                            <TableCell className="font-mono text-right">{formatINR(row.amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow data-testid={`qs-section-subtotal-${section.code}`}>
                          <TableCell colSpan={4} className="text-right font-semibold bg-amber-50">
                            Sub-Total ({section.code})
                          </TableCell>
                          <TableCell className="font-mono text-right font-semibold bg-amber-50">
                            {formatINR(section.subtotal)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="px-3 py-3 text-xs text-slate-500" data-testid={`qs-section-empty-${section.code}`}>No items in this section yet.</p>
                  )}
                </div>
              ))}
            </section>
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
            <CardTitle className="text-2xl" data-testid="qs-schedule-title">Construction Execution Timeline</CardTitle>
            <p className="text-sm text-slate-600" data-testid="qs-schedule-subtitle">
              Auto generated from your project inputs — phase durations, weekly view and Gantt-style timeline.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {!scheduleRows.length ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center" data-testid="qs-schedule-empty-state">
                <p className="text-sm text-slate-700">
                  Run <strong>Auto Generate Estimate</strong> to produce a phase-by-phase construction schedule from your project inputs.
                </p>
              </div>
            ) : (
              <>
                {(() => {
                  const totalDays = scheduleRows.reduce((sum, p) => sum + Number(p.days || 0), 0);
                  const totalWeeks = Number((totalDays / 7).toFixed(1));
                  const totalMonths = Number((totalDays / 30).toFixed(1));
                  const palette = [
                    { bg: "bg-amber-100", bar: "bg-amber-500", text: "text-amber-900", ring: "ring-amber-200" },
                    { bg: "bg-sky-100", bar: "bg-sky-500", text: "text-sky-900", ring: "ring-sky-200" },
                    { bg: "bg-violet-100", bar: "bg-violet-500", text: "text-violet-900", ring: "ring-violet-200" },
                    { bg: "bg-emerald-100", bar: "bg-emerald-500", text: "text-emerald-900", ring: "ring-emerald-200" },
                    { bg: "bg-rose-100", bar: "bg-rose-500", text: "text-rose-900", ring: "ring-rose-200" },
                    { bg: "bg-indigo-100", bar: "bg-indigo-500", text: "text-indigo-900", ring: "ring-indigo-200" },
                  ];
                  let cumulative = 0;
                  const ganttBars = scheduleRows.map((row, i) => {
                    const start = cumulative;
                    const days = Number(row.days || 0);
                    cumulative += days;
                    return {
                      ...row,
                      idx: i,
                      startDay: start,
                      endDay: cumulative,
                      startWeek: Number((start / 7).toFixed(1)),
                      endWeek: Number((cumulative / 7).toFixed(1)),
                      offsetPct: totalDays > 0 ? (start / totalDays) * 100 : 0,
                      widthPct: totalDays > 0 ? (days / totalDays) * 100 : 0,
                      palette: palette[i % palette.length],
                    };
                  });
                  const projectStartDate = new Date();
                  const projectEndDate = new Date();
                  projectEndDate.setDate(projectEndDate.getDate() + totalDays);
                  const fmtDate = (d) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

                  return (
                    <>
                      {/* KPI strip */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="qs-schedule-kpi-grid">
                        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4" data-testid="qs-schedule-kpi-days">
                          <p className="text-xs uppercase tracking-wider text-slate-500">Total Duration</p>
                          <p className="font-mono text-2xl text-slate-900">{totalDays} days</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4" data-testid="qs-schedule-kpi-weeks">
                          <p className="text-xs uppercase tracking-wider text-slate-500">In Weeks</p>
                          <p className="font-mono text-2xl text-slate-900">{totalWeeks}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4" data-testid="qs-schedule-kpi-months">
                          <p className="text-xs uppercase tracking-wider text-slate-500">In Months</p>
                          <p className="font-mono text-2xl text-slate-900">{totalMonths}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4" data-testid="qs-schedule-kpi-phases">
                          <p className="text-xs uppercase tracking-wider text-slate-500">Phases</p>
                          <p className="font-mono text-2xl text-slate-900">{scheduleRows.length}</p>
                        </div>
                      </div>

                      {/* Project window */}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3" data-testid="qs-schedule-window">
                        <div>
                          <p className="text-xs text-slate-500">Project Start</p>
                          <p className="font-mono text-sm text-slate-900">{fmtDate(projectStartDate)}</p>
                        </div>
                        <div className="flex-1 px-4">
                          <div className="h-1 rounded-full bg-gradient-to-r from-amber-400 via-sky-400 to-emerald-500" />
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-500">Estimated Handover</p>
                          <p className="font-mono text-sm text-slate-900">{fmtDate(projectEndDate)}</p>
                        </div>
                      </div>

                      {/* Gantt-style timeline */}
                      <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="qs-schedule-gantt">
                        <p className="mb-3 text-sm font-semibold text-slate-700">Phase Timeline (Gantt)</p>
                        <div className="space-y-3">
                          {ganttBars.map((bar) => (
                            <div key={`gantt-${bar.idx}`} className="grid grid-cols-12 items-center gap-2" data-testid={`qs-schedule-gantt-row-${bar.idx}`}>
                              <div className="col-span-3 truncate text-xs font-medium text-slate-700 sm:col-span-2">{bar.phase}</div>
                              <div className="col-span-9 sm:col-span-10">
                                <div className="relative h-8 w-full rounded-lg bg-slate-100">
                                  <div
                                    className={`absolute top-0 h-8 rounded-lg ${bar.palette.bar} ring-2 ${bar.palette.ring} flex items-center px-2`}
                                    style={{ left: `${bar.offsetPct}%`, width: `${Math.max(bar.widthPct, 4)}%` }}
                                    title={`Day ${bar.startDay} – ${bar.endDay} (${bar.days} days)`}
                                  >
                                    <span className="truncate text-[10px] font-semibold text-white">
                                      {bar.days}d · W{bar.startWeek}–W{bar.endWeek}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Week scale */}
                        <div className="mt-3 flex justify-between text-[10px] text-slate-400">
                          <span>Week 0</span>
                          <span>W{Math.round(totalWeeks * 0.25)}</span>
                          <span>W{Math.round(totalWeeks * 0.5)}</span>
                          <span>W{Math.round(totalWeeks * 0.75)}</span>
                          <span>W{totalWeeks}</span>
                        </div>
                      </div>

                      {/* Phase cards */}
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="qs-schedule-phase-cards">
                        {ganttBars.map((bar) => (
                          <div key={`card-${bar.idx}`} className={`rounded-xl border border-slate-200 ${bar.palette.bg} p-4`} data-testid={`qs-schedule-phase-card-${bar.idx}`}>
                            <div className="flex items-start justify-between">
                              <div>
                                <p className={`text-xs uppercase tracking-wider ${bar.palette.text}`}>Phase {bar.idx + 1}</p>
                                <p className="text-base font-semibold text-slate-900">{bar.phase}</p>
                              </div>
                              <div className={`rounded-full ${bar.palette.bar} px-2 py-1 text-xs font-bold text-white`}>{bar.days}d</div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
                              <div>
                                <p className="text-slate-500">Start</p>
                                <p className="font-mono">Day {bar.startDay} (W{bar.startWeek})</p>
                              </div>
                              <div>
                                <p className="text-slate-500">End</p>
                                <p className="font-mono">Day {bar.endDay} (W{bar.endWeek})</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Detailed table fallback */}
                      <details className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="qs-schedule-table-details">
                        <summary className="cursor-pointer text-sm font-medium text-slate-700">View as table</summary>
                        <Table data-testid="qs-schedule-table" className="mt-3">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Phase</TableHead>
                              <TableHead>Days</TableHead>
                              <TableHead>Weeks</TableHead>
                              <TableHead>Start (Day)</TableHead>
                              <TableHead>End (Day)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ganttBars.map((row) => (
                              <TableRow key={`${row.phase}-${row.idx}`} data-testid={`qs-schedule-row-${row.idx}`}>
                                <TableCell>{row.phase}</TableCell>
                                <TableCell className="font-mono">{row.days}</TableCell>
                                <TableCell className="font-mono">{(row.days / 7).toFixed(1)}</TableCell>
                                <TableCell className="font-mono">{row.startDay}</TableCell>
                                <TableCell className="font-mono">{row.endDay}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </details>
                    </>
                  );
                })()}
              </>
            )}
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
            <div className="flex flex-wrap items-end gap-2" data-testid="qs-weather-actions">
              <div>
                <p className="mb-1 text-xs text-slate-500">City (India)</p>
                <Input value={weatherCity} onChange={(e) => setWeatherCity(e.target.value)} className="w-[220px]" data-testid="qs-weather-city-input" />
              </div>
              <div className="flex-1 min-w-[260px]">
                <p className="mb-1 text-xs text-slate-500">OpenWeather API Key (saved locally)</p>
                <Input
                  type="password"
                  value={weatherApiKey}
                  onChange={(e) => saveWeatherApiKey(e.target.value)}
                  placeholder="Paste your OpenWeather API key here"
                  data-testid="qs-weather-api-key-input"
                />
              </div>
              <Button onClick={() => loadWeatherForecast(weatherCity)} data-testid="qs-weather-fetch-button">Fetch Forecast</Button>
            </div>
            <p className="text-xs text-slate-500" data-testid="qs-weather-key-help">
              Don't have a key? Get one free at <a href="https://openweathermap.org/api" target="_blank" rel="noreferrer" className="text-sky-600 underline">openweathermap.org/api</a> (Sign up → API Keys tab). The key is stored only in your browser.
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="qs-weather-status-panel">
              <p className="text-sm text-slate-700" data-testid="qs-weather-status-text">
                {weatherLoading ? "Loading weather forecast..." : weatherData?.message || "Weather forecast ready."}
              </p>
              {!weatherData?.hasApiKey ? (
                <p className="mt-1 text-xs text-amber-700" data-testid="qs-weather-missing-key-text">
                  No live data yet. Paste your OpenWeather API key above and click Fetch Forecast.
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