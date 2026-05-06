import { CATEGORY_FORMULAS, calculateMeasurementRow } from "@/utils/qsFormulaEngine";

export const defaultAutoAssumptions = {
  excavation_volume_per_sqm: 0.28,
  pcc_volume_per_sqm: 0.06,
  footing_volume_per_sqm: 0.08,
  rcc_volume_per_sqm: 0.3,
  brickwork_volume_per_sqm: 0.24,
  plaster_area_multiplier: 2.2,
  flooring_area_multiplier: 1.05,
  paint_area_multiplier: 3.0,
  waterproofing_area_multiplier: 0.22,
  steel_kg_per_sqm: 42,
  doors_windows_area_per_sqm: 0.18,
  plumbing_allowance_per_sqm: 0.12,
  electrical_allowance_per_sqm: 0.14,
  finishing_allowance_per_sqm: 0.35,
};

const qualityMultiplier = {
  Basic: 0.92,
  Standard: 1,
  Premium: 1.12,
  Luxury: 1.25,
};

const baseRates = {
  Excavation: 420,
  PCC: 6200,
  Footings: 7400,
  RCC: 8200,
  Columns: 8600,
  Beams: 8400,
  Slabs: 8800,
  Brickwork: 6400,
  Blockwork: 5100,
  Plaster: 340,
  Flooring: 560,
  Paint: 220,
  Waterproofing: 310,
  "Steel/BBS": 76,
  "Doors & Windows": 2500,
  Staircase: 9600,
  Terrace: 420,
  Plumbing: 900,
  Electrical: 1000,
  Finishing: 1600,
};

const pickUnit = (category) => {
  if (["Plaster", "Flooring", "Paint", "Waterproofing", "Terrace"].includes(category)) return "m2";
  if (["Steel/BBS"].includes(category)) return "kg";
  if (["Doors & Windows", "Plumbing", "Electrical", "Finishing"].includes(category)) return "ls";
  return "m3";
};

export const generateSemiAutomaticEstimate = ({
  builtUpAreaSqft,
  floors,
  qualityLevel,
  roomCounts,
  assumptions,
}) => {
  const effectiveAreaSqm = Number(builtUpAreaSqft || 0) * Number(floors || 1) * 0.092903;
  const qualityFactor = qualityMultiplier[qualityLevel] || 1;
  const usedAssumptions = { ...defaultAutoAssumptions, ...(assumptions || {}) };

  const bedroomCount = Number(roomCounts?.bedrooms || 0);
  const bathroomCount = Number(roomCounts?.bathrooms || 0);
  const kitchenCount = Number(roomCounts?.kitchens || 0);
  const totalFloors = Number(floors || 1);
  const buildingFootprintSqm = Number(builtUpAreaSqft || 0) * 0.092903;
  const plotEdgeEstimate = Math.sqrt(Math.max(buildingFootprintSqm, 1));
  const perimeterEstimate = plotEdgeEstimate * 4;
  const wallHeight = 3.1 * totalFloors;
  const columnCount = Math.max(8, Math.round(buildingFootprintSqm / 14));

  const createRow = (partial) => ({
    id: crypto.randomUUID(),
    category: partial.category,
    description: partial.description,
    length: partial.length || 0,
    width: partial.width || 0,
    height: partial.height || 0,
    depth: partial.depth || 0,
    diameter: partial.diameter || 0,
    quantity: partial.quantity || 0,
    quantity_override: Boolean(partial.quantity_override),
    unit: partial.unit || pickUnit(partial.category),
    formula: partial.formula || CATEGORY_FORMULAS[partial.category] || "length*width*height",
    additions: partial.additions || 0,
    deductions: partial.deductions || 0,
    wastage_percent: partial.wastage_percent ?? 3,
    rate: partial.rate || 0,
    amount: 0,
    note: partial.note || "Auto-generated from engineering assumptions",
  });

  const categoryRows = [
    createRow({
      category: "Excavation",
      description: "Foundation trench excavation (all sides)",
      length: perimeterEstimate * 0.9,
      width: 0.75,
      depth: 1.4,
      formula: "length*width*depth",
      rate: baseRates.Excavation * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "PCC",
      description: "PCC bed below footing",
      length: perimeterEstimate * 0.8,
      width: 0.65,
      depth: 0.1,
      formula: "length*width*depth",
      rate: baseRates.PCC * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "Footings",
      description: "Footing concrete volume",
      length: columnCount,
      width: 1,
      depth: 0.35,
      height: 1,
      formula: "length*width*depth*height",
      rate: baseRates.Footings * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "RCC",
      description: "Overall RCC volume (composite)",
      quantity: effectiveAreaSqm * usedAssumptions.rcc_volume_per_sqm * qualityFactor,
      quantity_override: true,
      rate: baseRates.RCC * qualityFactor,
      unit: "m3",
      note: "Composite RCC quantity using area factor",
    }),
    createRow({
      category: "Columns",
      description: "RCC columns",
      length: columnCount,
      width: 0.3,
      depth: 0.3,
      height: wallHeight,
      formula: "length*width*depth*height",
      rate: baseRates.Columns * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "Beams",
      description: "RCC beams",
      length: perimeterEstimate * totalFloors * 1.2,
      width: 0.23,
      depth: 0.45,
      formula: "length*width*depth",
      rate: baseRates.Beams * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "Slabs",
      description: "Slab concrete",
      length: effectiveAreaSqm,
      width: 1,
      depth: 0.13,
      formula: "length*width*depth",
      rate: baseRates.Slabs * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "Brickwork",
      description: "External + internal brick masonry",
      length: perimeterEstimate * 1.7,
      width: 0.23,
      height: wallHeight,
      formula: "length*width*height",
      deductions: (bedroomCount + bathroomCount + kitchenCount + 2) * 1.5,
      rate: baseRates.Brickwork * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "Blockwork",
      description: "Partition block masonry",
      length: perimeterEstimate * 0.8,
      width: 0.12,
      height: wallHeight,
      formula: "length*width*height",
      rate: baseRates.Blockwork * qualityFactor,
      unit: "m3",
    }),
    createRow({
      category: "Plaster",
      description: "Internal and external plaster area",
      length: perimeterEstimate * usedAssumptions.plaster_area_multiplier,
      height: wallHeight,
      formula: "length*height",
      rate: baseRates.Plaster * qualityFactor,
      unit: "m2",
    }),
    createRow({
      category: "Flooring",
      description: "Floor tile / finish area",
      length: effectiveAreaSqm,
      width: usedAssumptions.flooring_area_multiplier,
      formula: "length*width",
      rate: baseRates.Flooring * qualityFactor,
      unit: "m2",
    }),
    createRow({
      category: "Paint",
      description: "Paintable wall + ceiling area",
      length: effectiveAreaSqm,
      width: usedAssumptions.paint_area_multiplier,
      formula: "length*width",
      rate: baseRates.Paint * qualityFactor,
      unit: "m2",
    }),
    createRow({
      category: "Waterproofing",
      description: "Terrace and wet area waterproofing",
      length: effectiveAreaSqm,
      width: usedAssumptions.waterproofing_area_multiplier,
      formula: "length*width",
      rate: baseRates.Waterproofing * qualityFactor,
      unit: "m2",
    }),
    createRow({
      category: "Steel/BBS",
      description: "Reinforcement steel estimate",
      quantity: effectiveAreaSqm * usedAssumptions.steel_kg_per_sqm * qualityFactor,
      quantity_override: true,
      rate: baseRates["Steel/BBS"] * qualityFactor,
      unit: "kg",
      note: "Steel factor based on built-up area",
    }),
    createRow({
      category: "Doors & Windows",
      description: "Door and window openings",
      quantity: Math.max(1, (bedroomCount + bathroomCount + kitchenCount + 2) * 1.4),
      quantity_override: true,
      rate: baseRates["Doors & Windows"] * qualityFactor,
      unit: "ls",
    }),
    createRow({
      category: "Staircase",
      description: "Staircase structural + finish allowance",
      quantity: Math.max(1, totalFloors - 1) * 4.5,
      quantity_override: true,
      rate: baseRates.Staircase * qualityFactor,
      unit: "ls",
    }),
    createRow({
      category: "Terrace",
      description: "Terrace floor and weathering area",
      length: effectiveAreaSqm,
      width: 0.55,
      formula: "length*width",
      rate: baseRates.Terrace * qualityFactor,
      unit: "m2",
    }),
    createRow({
      category: "Plumbing",
      description: "Plumbing line and fitting allowance",
      quantity: effectiveAreaSqm * usedAssumptions.plumbing_allowance_per_sqm,
      quantity_override: true,
      rate: baseRates.Plumbing * qualityFactor,
      unit: "ls",
    }),
    createRow({
      category: "Electrical",
      description: "Electrical point and conduit allowance",
      quantity: effectiveAreaSqm * usedAssumptions.electrical_allowance_per_sqm,
      quantity_override: true,
      rate: baseRates.Electrical * qualityFactor,
      unit: "ls",
    }),
    createRow({
      category: "Finishing",
      description: "Final finishing, fixtures and overheads",
      quantity: effectiveAreaSqm * usedAssumptions.finishing_allowance_per_sqm,
      quantity_override: true,
      rate: baseRates.Finishing * qualityFactor,
      unit: "ls",
    }),
  ];

  const generatedRows = categoryRows.map((entry) => calculateMeasurementRow(entry));

  const totalVolumeEquivalent = generatedRows
    .filter((item) => ["Excavation", "PCC", "Footings", "RCC", "Columns", "Beams", "Slabs", "Brickwork"].includes(item.category))
    .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const scheduleDays = [
    { phase: "Excavation", days: Math.max(3, Math.ceil(totalVolumeEquivalent / 14)) },
    { phase: "Foundation + PCC", days: Math.max(6, Math.ceil(totalVolumeEquivalent / 12)) },
    { phase: "RCC Structure", days: Math.max(12, Math.ceil(totalVolumeEquivalent / 9)) },
    { phase: "Masonry + Plaster", days: Math.max(10, Math.ceil((effectiveAreaSqm * 2.2) / 48)) },
    { phase: "Flooring + Finishes", days: Math.max(15, Math.ceil((effectiveAreaSqm * 1.6) / 34)) },
  ];

  return {
    generatedRows,
    assumptionsUsed: usedAssumptions,
    scheduleDays,
    effectiveAreaSqm: Number(effectiveAreaSqm.toFixed(2)),
  };
};