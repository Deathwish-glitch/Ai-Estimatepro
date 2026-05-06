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

  const categoryRows = [
    { category: "Excavation", qty: effectiveAreaSqm * usedAssumptions.excavation_volume_per_sqm },
    { category: "PCC", qty: effectiveAreaSqm * usedAssumptions.pcc_volume_per_sqm },
    { category: "Footings", qty: effectiveAreaSqm * usedAssumptions.footing_volume_per_sqm },
    { category: "RCC", qty: effectiveAreaSqm * usedAssumptions.rcc_volume_per_sqm },
    { category: "Columns", qty: effectiveAreaSqm * usedAssumptions.rcc_volume_per_sqm * 0.22 },
    { category: "Beams", qty: effectiveAreaSqm * usedAssumptions.rcc_volume_per_sqm * 0.26 },
    { category: "Slabs", qty: effectiveAreaSqm * usedAssumptions.rcc_volume_per_sqm * 0.52 },
    { category: "Brickwork", qty: effectiveAreaSqm * usedAssumptions.brickwork_volume_per_sqm },
    { category: "Blockwork", qty: effectiveAreaSqm * usedAssumptions.brickwork_volume_per_sqm * 0.18 },
    { category: "Plaster", qty: effectiveAreaSqm * usedAssumptions.plaster_area_multiplier },
    { category: "Flooring", qty: effectiveAreaSqm * usedAssumptions.flooring_area_multiplier },
    { category: "Paint", qty: effectiveAreaSqm * usedAssumptions.paint_area_multiplier },
    { category: "Waterproofing", qty: effectiveAreaSqm * usedAssumptions.waterproofing_area_multiplier },
    { category: "Steel/BBS", qty: effectiveAreaSqm * usedAssumptions.steel_kg_per_sqm },
    {
      category: "Doors & Windows",
      qty: Math.max(1, (bedroomCount + bathroomCount + kitchenCount + 2) * 1.4),
    },
    { category: "Staircase", qty: Math.max(1, Number(floors || 1) - 1) * 4.5 },
    { category: "Terrace", qty: effectiveAreaSqm * 0.55 },
    { category: "Plumbing", qty: effectiveAreaSqm * usedAssumptions.plumbing_allowance_per_sqm },
    { category: "Electrical", qty: effectiveAreaSqm * usedAssumptions.electrical_allowance_per_sqm },
    { category: "Finishing", qty: effectiveAreaSqm * usedAssumptions.finishing_allowance_per_sqm },
  ];

  const generatedRows = categoryRows.map((entry) =>
    calculateMeasurementRow({
      id: crypto.randomUUID(),
      category: entry.category,
      description: `${entry.category} (Auto Generated)`,
      length: 0,
      width: 0,
      height: 0,
      depth: 0,
      diameter: 0,
      quantity: Number((entry.qty * qualityFactor).toFixed(4)),
      quantity_override: true,
      unit: pickUnit(entry.category),
      formula: CATEGORY_FORMULAS[entry.category] || "length*width*height",
      additions: 0,
      deductions: 0,
      wastage_percent: 3,
      rate: (baseRates[entry.category] || 0) * qualityFactor,
      amount: 0,
      note: "Auto-generated from built-up area assumptions",
    }),
  );

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