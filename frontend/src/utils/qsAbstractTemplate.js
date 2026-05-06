// Abstract + BOQ template aligned with the Sample BOQ Format
// (Sample BOQ - Commercial Building, Bengaluru — sourced from user-provided PDF)
// All exports (Excel & PDF) follow this exact structure.

export const ABSTRACT_SECTIONS = [
  { code: "A", title: "EXCAVATION", categories: ["Earthwork", "Excavation"] },
  {
    code: "B",
    title: "CONCRETE",
    categories: ["PCC", "Footings", "RCC", "Columns", "Beams", "Slabs", "Staircase"],
  },
  { code: "C", title: "SHUTTERING WORKS", categories: ["Shuttering"], derivedFrom: ["Columns", "Beams", "Slabs", "Footings"] },
  { code: "D", title: "METAL WORK", categories: ["Steel/BBS"] },
  { code: "E", title: "MASONRY WORKS", categories: ["Brickwork", "Blockwork"] },
  { code: "F", title: "PLASTERING", categories: ["Plaster"] },
  { code: "G", title: "WATER PROOFING & SUNKEN FILLING", categories: ["Waterproofing"] },
  { code: "H", title: "ROOFER", categories: ["Terrace"] },
  { code: "I", title: "PAINTING", categories: ["Paint"] },
  { code: "J", title: "FLOOR SCREED WORKS", categories: ["Flooring"] },
];

// Sections A-J as per template do not include MEP — keep these as separate
// abstract addendum so cost is not lost in the final report.
export const ABSTRACT_ADDENDUM_SECTIONS = [
  { code: "K", title: "DOORS & WINDOWS", categories: ["Doors & Windows"] },
  { code: "L", title: "PLUMBING", categories: ["Plumbing"] },
  { code: "M", title: "ELECTRICAL", categories: ["Electrical"] },
  { code: "N", title: "FINISHING & MISC", categories: ["Finishing"] },
];

// Basic Rates (Without GST) — exactly per the sample BOQ template.
// Figures are reasonable Indian market defaults; UI keeps them editable.
export const BASIC_RATES = [
  { sr: 1, description: "CEMENT", rate: 382, unit: "per bag" },
  { sr: 2, description: "STEEL", rate: 61000, unit: "per MT" },
  { sr: 3, description: "FLY ASH BRICKS", rate: 9.5, unit: "per No's" },
  { sr: 4, description: "COURSE AGGREGATE", rate: 78, unit: "per Cft" },
  { sr: 5, description: "MSAND", rate: 75, unit: "per Cft" },
  { sr: 6, description: "MSAND - Plastering", rate: 95, unit: "per Cft" },
  { sr: 7, description: "M50 - 460kg/m3 + GGBS or Equivalent", rate: 7900, unit: "per Cum" },
  { sr: 8, description: "M45 - 450kg/m3 + GGBS or Equivalent", rate: 7500, unit: "per Cum" },
  { sr: 9, description: "M40 - 425kg/m3 + GGBS or Equivalent", rate: 7100, unit: "per Cum" },
  { sr: 10, description: "M35 - 410kg/m3", rate: 6800, unit: "per Cum" },
  { sr: 11, description: "M30 - 380kg/m3", rate: 6400, unit: "per Cum" },
  { sr: 12, description: "M25 - 340kg/m3", rate: 6000, unit: "per Cum" },
  { sr: 13, description: "M25 - 300kg/m3 + 40kg FA", rate: 5700, unit: "per Cum" },
  { sr: 14, description: "M20 - 260kg/m3 + 60kg FA", rate: 5400, unit: "per Cum" },
];

export const SECTION_NOTES = {
  A: [
    "Rates include cost of labour, machinery hire, dewatering, transportation, lifting and disposal.",
    "Excavation as per IS 1200 and approved drawings.",
    "Sloping, shoring or strutting (if required) at contractor's cost.",
  ],
  B: [
    "Concrete grades as specified per location and conforming to IS 456:2000.",
    "Rate includes cement, sand, aggregate, water, batching, mixing, placing, compacting, curing and testing.",
    "Cube tests per IS 516 are mandatory for every grade and pour batch.",
  ],
  C: [
    "Shuttering rates include plywood, props, scaffolding, deshuttering and reuse cycles.",
    "All exposed faces shall use water-proof shuttering plywood with proper line and level.",
  ],
  D: [
    "TMT steel of grade Fe 500 confirming to IS 1786 only.",
    "Rate includes cutting, bending, binding wire, lapping, supports and chairs as per Bar Bending Schedule.",
    "Wastage to be borne by contractor, not in client account.",
  ],
  E: [
    "Mortar mix shall be 1:6 unless specified otherwise.",
    "All masonry to be cured minimum 7 days.",
    "Honeycomb and joint filling to be done before plaster.",
  ],
  F: [
    "Plaster thickness as per drawing; rates include curing, scaffolding, hacking, grooves and chamfering.",
    "Two-coat plaster on external faces.",
  ],
  G: [
    "Waterproofing system per approved make/specification with manufacturer warranty (min 10 years).",
    "Rates include surface preparation, priming, application coats and protection layer.",
  ],
  H: [
    "Weathering course concrete with brick-bat coba, screed concrete and waterproofing membrane.",
    "Slope to be maintained towards the rainwater outlet.",
  ],
  I: [
    "Painting includes surface preparation, primer + minimum 2 coats unless specified.",
    "Approved make of paint (Asian / Berger / Nerolac or equivalent).",
  ],
  J: [
    "Concrete floor screed grade as per drawing (M25 or as specified) with laser leveling where mentioned.",
    "Surface to be finished smooth or anti-skid as required.",
  ],
};

export const FLOOR_LABELS_DEFAULT = [
  "Ground floor",
  "First floor",
  "Second floor",
  "Third floor",
  "Fourth floor",
  "Fifth floor",
  "Sixth floor",
  "Seventh floor",
];

// Categories that benefit from floor-wise split (matches sample BOQ template).
export const PER_FLOOR_CATEGORIES = [
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
];

// Preset assumption profiles (P1 — Task 2)
export const PROJECT_PRESETS = {
  Villa: {
    label: "Independent Villa",
    description: "Premium standalone villa with 2-3 floors and large rooms",
    rate_profile: "Premium",
    floors: 2,
    construction_type: "RCC Frame",
    rooms: { bedrooms: 3, bathrooms: 3, kitchens: 1, living_rooms: 1 },
    assumptions: {
      plaster_area_multiplier: 2.4,
      finishing_allowance_per_sqm: 0.45,
      flooring_area_multiplier: 1.1,
    },
  },
  "G+1 House": {
    label: "G+1 Residential House",
    description: "Standard ground + 1 floor residential dwelling",
    rate_profile: "Standard",
    floors: 2,
    construction_type: "RCC Frame",
    rooms: { bedrooms: 2, bathrooms: 2, kitchens: 1, living_rooms: 1 },
    assumptions: {},
  },
  Apartment: {
    label: "Apartment Block",
    description: "Multi-storied apartment with shared circulation",
    rate_profile: "Standard",
    floors: 4,
    construction_type: "RCC Frame",
    rooms: { bedrooms: 6, bathrooms: 6, kitchens: 2, living_rooms: 2 },
    assumptions: {
      rcc_volume_per_sqm: 0.34,
      steel_kg_per_sqm: 48,
      plaster_area_multiplier: 2.3,
    },
  },
  Commercial: {
    label: "Commercial Building",
    description: "Commercial shell with open floor plates and basements",
    rate_profile: "Premium",
    floors: 3,
    construction_type: "RCC Frame",
    rooms: { bedrooms: 0, bathrooms: 4, kitchens: 1, living_rooms: 0 },
    assumptions: {
      rcc_volume_per_sqm: 0.36,
      steel_kg_per_sqm: 55,
      brickwork_volume_per_sqm: 0.18,
      plaster_area_multiplier: 2.0,
      finishing_allowance_per_sqm: 0.5,
    },
  },
};

const sumRows = (rows) => rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

export const buildAbstract = (measurements) => {
  const main = ABSTRACT_SECTIONS.map((section, index) => ({
    sl: index + 1,
    code: section.code,
    description: section.title,
    amount: sumRows(measurements.filter((row) => section.categories.includes(row.category))),
  }));
  const addendum = ABSTRACT_ADDENDUM_SECTIONS.map((section, index) => ({
    sl: ABSTRACT_SECTIONS.length + index + 1,
    code: section.code,
    description: section.title,
    amount: sumRows(measurements.filter((row) => section.categories.includes(row.category))),
  }));
  return { main, addendum, grandTotal: [...main, ...addendum].reduce((s, r) => s + r.amount, 0) };
};

const splitRowAcrossFloors = (row, floors, labels = FLOOR_LABELS_DEFAULT) => {
  const numFloors = Math.max(1, Number(floors || 1));
  if (numFloors <= 1 || !PER_FLOOR_CATEGORIES.includes(row.category)) {
    return [{ ...row, floor: labels[0] || "Ground floor" }];
  }
  const perFloorQty = Number(row.quantity || 0) / numFloors;
  const perFloorAmount = Number(row.amount || 0) / numFloors;
  return Array.from({ length: numFloors }, (_, i) => ({
    ...row,
    floor: labels[i] || `Floor ${i + 1}`,
    description: `${row.description} - ${labels[i] || `Floor ${i + 1}`}`,
    quantity: Number(perFloorQty.toFixed(4)),
    amount: Number(perFloorAmount.toFixed(2)),
  }));
};

export const buildDetailedBoqBySection = (measurements, floors = 1) => {
  const all = [...ABSTRACT_SECTIONS, ...ABSTRACT_ADDENDUM_SECTIONS];
  return all.map((section) => {
    const sectionRows = measurements
      .filter((row) => section.categories.includes(row.category))
      .flatMap((row) => splitRowAcrossFloors(row, floors));
    return {
      code: section.code,
      title: section.title,
      notes: SECTION_NOTES[section.code] || [],
      rows: sectionRows,
      subtotal: sumRows(sectionRows),
    };
  });
};
