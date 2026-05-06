import { Parser } from "expr-eval";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const CATEGORY_FORMULAS = {
  Earthwork: "length*width*depth",
  Excavation: "length*width*depth",
  PCC: "length*width*depth",
  Footings: "length*width*depth",
  RCC: "length*width*depth",
  Columns: "length*width*height",
  Beams: "length*width*depth",
  Slabs: "length*width*depth",
  Brickwork: "length*width*height",
  Blockwork: "length*width*height",
  Plaster: "length*height",
  Flooring: "length*width",
  Paint: "length*height",
  Waterproofing: "length*width",
  "Steel/BBS": "(diameter*diameter/162)*length",
  "Doors & Windows": "length*width",
  Plumbing: "length",
  Electrical: "length",
  "Compound Wall": "length*height*width",
  Staircase: "length*width*height",
  Terrace: "length*width",
  Finishing: "length*width",
};

const mathScope = {
  sqrt: Math.sqrt,
  pow: Math.pow,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: Math.round,
};

const formulaParser = new Parser();

const variableAliasMap = {
  length: "L",
  width: "W",
  height: "H",
  depth: "D",
  diameter: "DIA",
};

const allowedVariables = new Set(["L", "W", "H", "D", "DIA"]);
const allowedFormulaPattern = /^[a-zA-Z0-9_+\-*/().,\s^]*$/;

const normalizeFormulaVariables = (formulaText) => {
  let normalized = formulaText;
  Object.entries(variableAliasMap).forEach(([fromVar, toVar]) => {
    normalized = normalized.replace(new RegExp(`\\b${fromVar}\\b`, "g"), toVar);
  });
  return normalized;
};

export const evaluateFormula = (formula, dimensions) => {
  const safeFormula = String(formula || "").trim();
  if (!safeFormula) return 0;
  if (!allowedFormulaPattern.test(safeFormula)) return 0;
  const normalizedFormula = normalizeFormulaVariables(safeFormula);

  const scope = {
    L: toNumber(dimensions.length),
    W: toNumber(dimensions.width),
    H: toNumber(dimensions.height),
    D: toNumber(dimensions.depth),
    DIA: toNumber(dimensions.diameter),
    ...mathScope,
  };

  try {
    const expression = formulaParser.parse(normalizedFormula);
    const expressionVariables = expression.variables();
    const hasInvalidVariable = expressionVariables.some((variableName) => !allowedVariables.has(variableName));
    if (hasInvalidVariable) return 0;

    const value = expression.evaluate(scope);
    return toNumber(value);
  } catch {
    return 0;
  }
};

export const calculateMeasurementRow = (row) => {
  const baseQuantity = row.quantity_override ? toNumber(row.quantity) : evaluateFormula(row.formula, row);
  const additions = toNumber(row.additions);
  const deductions = toNumber(row.deductions);
  const wastagePercent = toNumber(row.wastage_percent);
  const adjustedQuantity = Math.max(0, (baseQuantity + additions - deductions) * (1 + wastagePercent / 100));
  const amount = adjustedQuantity * toNumber(row.rate);

  return {
    ...row,
    quantity: Number(adjustedQuantity.toFixed(4)),
    amount: Number(amount.toFixed(2)),
  };
};

export const buildBoqFromMeasurements = (rows) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const key = `${row.category}::${row.description}::${row.unit}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        section: row.category,
        description: row.description,
        qty: 0,
        unit: row.unit,
        rate: toNumber(row.rate),
        total: 0,
      });
    }

    const item = grouped.get(key);
    item.qty += toNumber(row.quantity);
    item.rate = toNumber(row.rate) || item.rate;
    item.total += toNumber(row.amount);
  });

  return Array.from(grouped.values()).map((item, index) => ({
    id: `boq-${index + 1}`,
    sr_no: index + 1,
    ...item,
    qty: Number(item.qty.toFixed(4)),
    total: Number(item.total.toFixed(2)),
  }));
};

export const calcTotals = (rows) => {
  const totalAmount = rows.reduce((sum, row) => sum + toNumber(row.amount), 0);
  const totalQuantity = rows.reduce((sum, row) => sum + toNumber(row.quantity), 0);
  return {
    totalAmount: Number(totalAmount.toFixed(2)),
    totalQuantity: Number(totalQuantity.toFixed(4)),
  };
};