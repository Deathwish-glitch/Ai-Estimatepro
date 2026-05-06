import { calculateMeasurementRow, evaluateFormula } from "./qsFormulaEngine";

describe("qsFormulaEngine security + calculation", () => {
  test("evaluates valid arithmetic formula", () => {
    const qty = evaluateFormula("length*width*height", {
      length: 4,
      width: 0.23,
      height: 3,
      depth: 0,
      diameter: 0,
    });
    expect(qty).toBeCloseTo(2.76, 4);
  });

  test("blocks arbitrary/unsafe expression", () => {
    const qty = evaluateFormula('constructor.constructor("return 99")()', {
      length: 4,
      width: 0.23,
      height: 3,
      depth: 0,
      diameter: 0,
    });
    expect(qty).toBe(0);
  });

  test("measurement row amount updates from valid formula", () => {
    const row = calculateMeasurementRow({
      category: "Brickwork",
      description: "Test",
      length: 4,
      width: 0.23,
      height: 3,
      depth: 0,
      diameter: 0,
      quantity: 0,
      quantity_override: false,
      unit: "m3",
      formula: "length*width*height",
      additions: 0,
      deductions: 0,
      wastage_percent: 0,
      rate: 5000,
      amount: 0,
      note: "",
    });

    expect(row.quantity).toBeCloseTo(2.76, 4);
    expect(row.amount).toBeCloseTo(13800, 2);
  });
});