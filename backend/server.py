import logging
import os
import re
import uuid
import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

import fitz
import requests
from dotenv import load_dotenv
from emergentintegrations.llm.chat import FileContentWithMimeType, LlmChat, UserMessage
from fastapi import APIRouter, FastAPI, File, Form, HTTPException, Query, UploadFile
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ValidationError
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="AI Estimate Pro API")
api_router = APIRouter(prefix="/api")

BASE_RATE_BY_TYPE: Dict[str, float] = {"Basic": 1800, "Standard": 2300, "Premium": 3000}
MATERIAL_FACTOR_BY_TYPE: Dict[str, float] = {"Basic": 0.95, "Standard": 1.0, "Premium": 1.08}

DEFAULT_LOCAL_RATES = {
    "Cement": {"rate": 382.0, "unit": "bag"},
    "Steel": {"rate": 61.0, "unit": "kg"},
    "Sand": {"rate": 3350.0, "unit": "brass"},
    "Brick": {"rate": 9.2, "unit": "nos"},
}

MATERIAL_ALIASES = {
    "cement": "Cement",
    "opc cement": "Cement",
    "ppc cement": "Cement",
    "steel": "Steel",
    "tmt": "Steel",
    "tmt steel": "Steel",
    "sand": "Sand",
    "river sand": "Sand",
    "msand": "Sand",
    "m-sand": "Sand",
    "brick": "Brick",
    "bricks": "Brick",
}

DETAILED_MATERIAL_LIBRARY = [
    ("Structural", "OPC Cement", 0.28, "bags", "RCC and structural members"),
    ("Structural", "PPC Cement", 0.16, "bags", "Plaster and masonry support"),
    ("Structural", "River Sand", 0.014, "m³", "Concrete and masonry"),
    ("Structural", "M-Sand", 0.012, "m³", "Plaster and block work"),
    ("Structural", "20mm Aggregate", 0.018, "m³", "RCC mix"),
    ("Structural", "10mm Aggregate", 0.007, "m³", "Slabs and screeds"),
    ("Structural", "TMT Steel Fe500", 0.0032, "tons", "Reinforcement"),
    ("Structural", "Binding Wire", 0.085, "kg", "Rebar tying"),
    ("Masonry", "Clay Bricks", 6.8, "nos", "External and internal walls"),
    ("Masonry", "AAC Blocks", 1.9, "nos", "Partition walls"),
    ("Masonry", "Mortar Admixture", 0.02, "kg", "Workability improvement"),
    ("Waterproofing", "Waterproofing Compound", 0.06, "kg", "Wet areas and slabs"),
    ("Waterproofing", "Bitumen Coating", 0.045, "kg", "Foundation and roof treatment"),
    ("Finishing", "Floor Tiles", 0.88, "sq.ft", "Primary flooring"),
    ("Finishing", "Wall Tiles", 0.42, "sq.ft", "Bathroom and kitchen walls"),
    ("Finishing", "Tile Adhesive", 0.2, "kg", "Tile fixing"),
    ("Finishing", "Wall Putty", 0.18, "kg", "Wall preparation"),
    ("Finishing", "Primer", 0.055, "liters", "Pre-paint coat"),
    ("Finishing", "Interior Paint", 0.09, "liters", "Inside wall finish"),
    ("Finishing", "Exterior Paint", 0.035, "liters", "Weather coat"),
    ("MEP", "CPVC Water Pipe", 0.14, "m", "Water supply lines"),
    ("MEP", "PVC Drainage Pipe", 0.09, "m", "Drainage network"),
    ("MEP", "Electrical Conduit", 0.2, "m", "Concealed wiring paths"),
    ("MEP", "Copper Wire Coils", 0.006, "coils", "Electrical wiring"),
    ("MEP", "Switches and Sockets", 0.028, "nos", "Electrical points"),
    ("MEP", "Distribution Board", 0.0005, "nos", "Power distribution"),
    ("MEP", "Sanitary Fixture Set", 0.0032, "sets", "WC, basin, fittings"),
    ("Openings", "Flush Doors", 0.0032, "nos", "Room doors"),
    ("Openings", "Aluminium Windows", 0.0045, "nos", "Window units"),
    ("Openings", "Window Glass", 0.07, "sq.m", "Glazing requirement"),
]

SCHEDULE_PHASES = [
    {
        "name": "Pre-Construction Setup",
        "tasks": ["Site survey and layout marking", "Temporary utilities setup", "Material storage and safety zoning"],
        "milestone": "Site ready for excavation",
        "crew_base": 6,
    },
    {
        "name": "Excavation and Earthwork",
        "tasks": ["Excavation to design depth", "Soil disposal and leveling", "Compaction checks"],
        "milestone": "Excavation approved",
        "crew_base": 10,
    },
    {
        "name": "Foundation and Plinth",
        "tasks": ["PCC bed and footing reinforcement", "Footing and plinth concrete", "Anti-termite and waterproofing treatment"],
        "milestone": "Plinth beam completed",
        "crew_base": 12,
    },
    {
        "name": "RCC Frame and Slabs",
        "tasks": ["Column casting and shuttering", "Beam and slab reinforcement", "Concrete pouring and curing cycle"],
        "milestone": "Structural frame topped out",
        "crew_base": 16,
    },
    {
        "name": "Masonry and Roofing",
        "tasks": ["External and partition block work", "Lintel and sill casting", "Roof weatherproof treatment"],
        "milestone": "Shell construction closed",
        "crew_base": 14,
    },
    {
        "name": "MEP Rough-Ins",
        "tasks": ["Electrical conduit and box fixing", "Plumbing and drainage routing", "Pressure and leakage pre-tests"],
        "milestone": "MEP rough-ins approved",
        "crew_base": 10,
    },
    {
        "name": "Finishing and Fixtures",
        "tasks": ["Plastering, putty and primer", "Flooring and wall tile works", "Painting, carpentry and fixture installation"],
        "milestone": "Interior finishes complete",
        "crew_base": 15,
    },
    {
        "name": "Testing and Handover",
        "tasks": ["Final electrical and plumbing testing", "Snag corrections and cleaning", "Handover walkthrough and documentation"],
        "milestone": "Project ready for occupancy",
        "crew_base": 6,
    },
]

SCHEDULE_WEIGHTS = [0.06, 0.12, 0.16, 0.24, 0.14, 0.11, 0.13, 0.04]
CONSTRUCTION_TIPS = [
    "Proper curing improves concrete strength and durability.",
    "Plan plumbing and electrical sleeves before slab casting.",
    "Good drainage around foundations helps prevent water damage.",
    "Track material wastage weekly to keep the estimate accurate.",
]

CHAT_SYSTEM_PROMPT = (
    "You are AI Estimate Pro Assistant, a practical and clear construction planning helper. "
    "Answer in concise bullet points (max 8 bullets, max 180 words). Help with both app usage and construction estimation guidance. "
    "Always add a short disclaimer that values are approximate and local engineer validation is recommended for execution."
)

DRAWING_ANALYZER_SYSTEM_PROMPT = (
    "You are an expert civil drawing interpreter. Read floor plans/site layouts and return strict JSON only. "
    "Detect walls, rooms, columns, doors, windows, staircases, slabs, dimensions, room labels, wall thicknesses. "
    "For quantity mode HYBRID: keep structural values strict (no guessing if missing), and estimate finishing values with clear assumptions + warnings."
)

DRAWING_JSON_SCHEMA_NOTE = {
    "detected_elements": {"walls": 0, "rooms": 0, "columns": 0, "doors": 0, "windows": 0, "staircases": 0, "slabs": 0},
    "dimensions": [{"label": "Living Room Length", "value": 4.2, "unit": "m"}],
    "room_labels": ["Living", "Kitchen", "Bedroom-1"],
    "wall_thickness_mm": [115, 230],
    "derived_metrics": {
        "wall_area_m2": 0,
        "concrete_volume_m3": 0,
        "brickwork_m3": 0,
        "brick_quantity_no": 0,
        "steel_quantity_ton": 0,
        "plaster_area_m2": 0,
        "flooring_area_m2": 0,
    },
    "warnings": [{"severity": "medium", "message": "Missing dimensions in two rooms"}],
    "assumptions": ["Finishing area estimated from visible room labels where dimensions are missing"],
}


class ContractorQuoteInput(BaseModel):
    material_cost: Optional[float] = Field(default=None, ge=0)
    labour_cost: Optional[float] = Field(default=None, ge=0)
    total_cost: Optional[float] = Field(default=None, ge=0)


class EstimateInput(BaseModel):
    plot_size_sqft: float = Field(gt=0)
    built_up_area_sqft: float = Field(gt=0)
    floors: int = Field(ge=1, le=5)
    building_type: Literal["Basic", "Standard", "Premium"]
    location: str = Field(min_length=2, max_length=100)
    labour_cost_adjustment_pct: float = Field(default=0, ge=-30, le=60)
    material_price_variation_pct: float = Field(default=0, ge=-30, le=60)
    refresh_frequency: Literal["daily", "weekly"] = "weekly"
    contractor_quote: Optional[ContractorQuoteInput] = None


class CostBreakdown(BaseModel):
    material_cost: float
    labour_cost: float
    contractor_profit: float
    gst_tax: float
    total_estimate: float
    cost_per_sqft: float


class MaterialQuantity(BaseModel):
    name: str
    quantity: float
    unit: str


class DetailedMaterialItem(BaseModel):
    category: str
    name: str
    quantity: float
    unit: str
    note: str


class SchedulePhase(BaseModel):
    phase: str
    start_week: int
    end_week: int
    tasks: List[str]
    milestone: str
    expected_crew_size: int


class OptimizedScheduleStage(BaseModel):
    stage: str
    duration_days: int
    can_run_parallel: bool
    parallel_with: Optional[str] = None


class MarketRateItem(BaseModel):
    material: str
    avg_local_rate: float
    unit: str
    source_count: int
    cheapest_supplier: Optional[str] = None
    cheapest_rate: Optional[float] = None


class SupplierRecommendation(BaseModel):
    material: str
    supplier_name: str
    location: str
    rate: float
    unit: str


class ComparisonRow(BaseModel):
    category: str
    contractor_cost: float
    ai_estimate_cost: float
    savings: float


class ContractorComparison(BaseModel):
    rows: List[ComparisonRow]
    contractor_total: float
    ai_total: float
    total_savings: float
    savings_percent: float


class EstimateResult(BaseModel):
    project_area_sqft: float
    duration_weeks: int
    cost_breakdown: CostBreakdown
    materials: List[MaterialQuantity]
    detailed_materials: List[DetailedMaterialItem]
    schedule: List[SchedulePhase]
    optimized_schedule: List[OptimizedScheduleStage]
    local_market_rates: List[MarketRateItem]
    recommended_suppliers: List[SupplierRecommendation]
    contractor_comparison: ContractorComparison
    estimated_savings_pct: float
    tips: List[str]
    suggestions: List[str]


class SaveProjectRequest(BaseModel):
    project_name: str = Field(min_length=2, max_length=80)
    input_data: EstimateInput


class SavedProject(BaseModel):
    id: str
    project_name: str
    created_at: str
    input_data: EstimateInput
    result: EstimateResult


class SupplierMaterialPrice(BaseModel):
    material: str
    rate: float = Field(gt=0)
    unit: str


class SupplierRateSubmission(BaseModel):
    supplier_name: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=80)
    prices: List[SupplierMaterialPrice] = Field(min_items=1)


class SupplierRateRecord(BaseModel):
    id: str
    supplier_name: str
    location: str
    prices: List[SupplierMaterialPrice]
    source_type: Literal["supplier_manual", "whatsapp"]
    updated_at: str


class MarketSourceEntryCreate(BaseModel):
    source_type: Literal["supplier_manual", "website", "government", "whatsapp"]
    supplier_name: str = Field(default="Unknown", min_length=2, max_length=120)
    location: str = Field(default="Nashik", min_length=2, max_length=100)
    material: str
    rate: float = Field(gt=0)
    unit: str
    source_reference: Optional[str] = Field(default=None, max_length=300)


class MarketSourceEntry(BaseModel):
    id: str
    source_type: str
    supplier_name: str
    location: str
    material: str
    rate: float
    unit: str
    normalized_material: str
    normalized_rate: float
    normalized_unit: str
    source_reference: Optional[str]
    collected_at: str


class MarketRatesResponse(BaseModel):
    refresh_frequency: Literal["daily", "weekly"]
    last_updated: str
    items: List[MarketRateItem]


class MarketSettings(BaseModel):
    refresh_frequency: Literal["daily", "weekly"]


class TrendPoint(BaseModel):
    date: str
    avg_rate: float


class MaterialTrendResponse(BaseModel):
    material: str
    unit: str
    points: List[TrendPoint]


class ScrapeRequest(BaseModel):
    urls: List[str] = Field(min_items=1, max_items=10)
    location: str = Field(default="Nashik")


class ScrapeResponse(BaseModel):
    processed_urls: int
    created_entries: int


class ChatSessionResponse(BaseModel):
    session_id: str


class ChatMessageRequest(BaseModel):
    session_id: str = Field(min_length=8)
    message: str = Field(min_length=2, max_length=2000)
    project_context: Optional[str] = Field(default=None, max_length=2000)


class ChatMessageResponse(BaseModel):
    session_id: str
    reply: str
    created_at: str


class ChatHistoryItem(BaseModel):
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    text: str
    created_at: str


class DrawingDetectedElements(BaseModel):
    walls: int
    rooms: int
    columns: int
    doors: int
    windows: int
    staircases: int
    slabs: int


class DrawingDimension(BaseModel):
    label: str
    value: float
    unit: str


class DrawingWarning(BaseModel):
    severity: Literal["high", "medium", "low"]
    message: str


class DrawingBoqItem(BaseModel):
    item: str
    quantity: float
    unit: str
    confidence_score: float
    confidence_level: Literal["high", "medium", "low"]


class DrawingCostEstimate(BaseModel):
    material_cost: float
    labour_cost: float
    total_estimate: float


class DrawingManualComparisonRow(BaseModel):
    item: str
    manual_quantity: float
    ai_quantity: float
    variance_pct: float


class DrawingTimeComparison(BaseModel):
    manual_time_required: str
    ai_time_required: str


class DrawingScheduleStage(BaseModel):
    stage: str
    duration_days: int
    can_run_parallel: bool
    parallel_with: Optional[str] = None


class DrawingCalibrationInfo(BaseModel):
    reference_length_m: Optional[float] = None
    applied: bool
    scale_factor: float
    note: str


class DrawingAnalysisSummary(BaseModel):
    analysis_id: str
    project_name: str
    file_name: str
    generated_at: str
    total_estimate: float
    warning_count: int


class DrawingBoqDelta(BaseModel):
    item: str
    base_quantity: float
    target_quantity: float
    delta_quantity: float
    delta_percent: float


class DrawingAnalysisComparisonResponse(BaseModel):
    base_analysis_id: str
    target_analysis_id: str
    base_project_name: str
    target_project_name: str
    cost_delta: float
    duration_delta_days: int
    boq_deltas: List[DrawingBoqDelta]


class DrawingAnalysisResponse(BaseModel):
    analysis_id: str
    project_name: str
    file_name: str
    file_type: str
    quantity_mode: Literal["strict", "assisted", "hybrid"]
    detected_elements: DrawingDetectedElements
    dimensions: List[DrawingDimension]
    room_labels: List[str]
    wall_thickness_mm: List[float]
    boq_items: List[DrawingBoqItem]
    market_rates_used: List[MarketRateItem]
    cost_estimate: DrawingCostEstimate
    warnings: List[DrawingWarning]
    assumptions: List[str]
    calibration: DrawingCalibrationInfo
    optimized_schedule: List[DrawingScheduleStage]
    manual_vs_ai_quantities: List[DrawingManualComparisonRow]
    method_time_comparison: DrawingTimeComparison
    generated_at: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_material_name(material: str) -> str:
    normalized = re.sub(r"\s+", " ", material.strip().lower())
    return MATERIAL_ALIASES.get(normalized, material.strip().title())


def _convert_rate_to_base(material: str, rate: float, unit: str) -> tuple[float, str]:
    normalized_material = _normalize_material_name(material)
    normalized_unit = unit.strip().lower()
    if normalized_material == "Steel" and normalized_unit in {"ton", "tons", "tonne", "tonnes"}:
        return rate / 1000, "kg"
    if normalized_material == "Steel" and normalized_unit in {"quintal", "qtl"}:
        return rate / 100, "kg"
    if normalized_material == "Sand" and normalized_unit in {"m3", "m³", "cum"}:
        return rate * 2.83, "brass"
    if normalized_material == "Brick" and normalized_unit in {"1000 nos", "thousand"}:
        return rate / 1000, "nos"
    if normalized_material == "Cement" and normalized_unit in {"bag", "bags"}:
        return rate, "bag"
    if normalized_material == "Steel" and normalized_unit == "kg":
        return rate, "kg"
    if normalized_material == "Sand" and normalized_unit == "brass":
        return rate, "brass"
    if normalized_material == "Brick" and normalized_unit in {"nos", "no"}:
        return rate, "nos"
    return rate, unit


def _location_multiplier(location: str) -> float:
    normalized = location.strip().lower()
    if "nashik" in normalized:
        return 0.98
    if any(token in normalized for token in ["metro", "urban", "mumbai", "delhi", "bengaluru"]):
        return 1.12
    if any(token in normalized for token in ["village", "rural", "tier 3"]):
        return 0.9
    return 1.0


def _allocate_phase_weeks(duration_weeks: int) -> List[int]:
    weeks = [max(1, int(duration_weeks * weight)) for weight in SCHEDULE_WEIGHTS]
    delta = duration_weeks - sum(weeks)
    while delta > 0:
        for idx in range(len(weeks)):
            weeks[idx] += 1
            delta -= 1
            if delta == 0:
                break
    while delta < 0:
        for idx in reversed(range(len(weeks))):
            if weeks[idx] > 1:
                weeks[idx] -= 1
                delta += 1
                if delta == 0:
                    break
    return weeks


def _round_quantity(value: float, unit: str) -> float:
    if unit in {"nos", "sets"}:
        return round(value, 0)
    if unit in {"tons", "coils"}:
        return round(value, 3)
    return round(value, 2)


def _build_detailed_materials(effective_area: float, building_type: str) -> List[DetailedMaterialItem]:
    type_factor = MATERIAL_FACTOR_BY_TYPE[building_type]
    detailed: List[DetailedMaterialItem] = []
    for category, name, coefficient, unit, note in DETAILED_MATERIAL_LIBRARY:
        base_quantity = effective_area * coefficient * type_factor
        detailed.append(
            DetailedMaterialItem(
                category=category,
                name=name,
                quantity=_round_quantity(base_quantity, unit),
                unit=unit,
                note=note,
            )
        )
    return detailed


def _extract_primary_material_quantities(detailed_materials: List[DetailedMaterialItem]) -> Dict[str, float]:
    cement_qty = sum(item.quantity for item in detailed_materials if "cement" in item.name.lower())
    steel_tons = sum(item.quantity for item in detailed_materials if "steel" in item.name.lower() and item.unit == "tons")
    sand_m3 = sum(item.quantity for item in detailed_materials if "sand" in item.name.lower() and item.unit in {"m³", "m3"})
    brick_qty = sum(item.quantity for item in detailed_materials if "brick" in item.name.lower())
    return {
        "Cement": cement_qty,
        "Steel": steel_tons * 1000,
        "Sand": sand_m3 / 2.83 if sand_m3 > 0 else 0,
        "Brick": brick_qty,
    }


def _build_optimized_schedule(floors: int) -> List[OptimizedScheduleStage]:
    floor_factor = max(0, floors - 1)
    return [
        OptimizedScheduleStage(stage="Excavation", duration_days=3 + floor_factor, can_run_parallel=False),
        OptimizedScheduleStage(stage="Foundation", duration_days=7 + floor_factor, can_run_parallel=False),
        OptimizedScheduleStage(stage="Structure", duration_days=12 + (2 * floor_factor), can_run_parallel=False),
        OptimizedScheduleStage(stage="MEP Rough-Ins", duration_days=8 + floor_factor, can_run_parallel=True, parallel_with="Brickwork"),
        OptimizedScheduleStage(stage="Brickwork", duration_days=10 + floor_factor, can_run_parallel=True, parallel_with="MEP Rough-Ins"),
        OptimizedScheduleStage(stage="Finishing", duration_days=15 + (2 * floor_factor), can_run_parallel=False),
    ]


def _estimate_comparison(
    cost_breakdown: CostBreakdown,
    contractor_quote: Optional[ContractorQuoteInput],
) -> ContractorComparison:
    contractor_material = contractor_quote.material_cost if contractor_quote and contractor_quote.material_cost is not None else cost_breakdown.material_cost * 1.14
    contractor_labour = contractor_quote.labour_cost if contractor_quote and contractor_quote.labour_cost is not None else cost_breakdown.labour_cost * 1.12
    contractor_total = contractor_quote.total_cost if contractor_quote and contractor_quote.total_cost is not None else (contractor_material + contractor_labour + (cost_breakdown.gst_tax * 1.15))

    rows = [
        ComparisonRow(
            category="Material",
            contractor_cost=round(contractor_material, 2),
            ai_estimate_cost=round(cost_breakdown.material_cost, 2),
            savings=round(contractor_material - cost_breakdown.material_cost, 2),
        ),
        ComparisonRow(
            category="Labour",
            contractor_cost=round(contractor_labour, 2),
            ai_estimate_cost=round(cost_breakdown.labour_cost, 2),
            savings=round(contractor_labour - cost_breakdown.labour_cost, 2),
        ),
        ComparisonRow(
            category="Total",
            contractor_cost=round(contractor_total, 2),
            ai_estimate_cost=round(cost_breakdown.total_estimate, 2),
            savings=round(contractor_total - cost_breakdown.total_estimate, 2),
        ),
    ]
    total_savings = round(contractor_total - cost_breakdown.total_estimate, 2)
    savings_percent = round((total_savings / contractor_total) * 100, 2) if contractor_total > 0 else 0
    return ContractorComparison(
        rows=rows,
        contractor_total=round(contractor_total, 2),
        ai_total=round(cost_breakdown.total_estimate, 2),
        total_savings=total_savings,
        savings_percent=savings_percent,
    )


def _build_suggestions(
    input_data: EstimateInput,
    market_rates: List[MarketRateItem],
    comparison: ContractorComparison,
) -> List[str]:
    suggestions = [
        "Use weekly rate tracking before bulk procurement to lock better prices.",
        "Keep a 5-7% contingency buffer for transport and minor wastage.",
        "Bundle cement and steel purchase with one supplier to negotiate dispatch discounts.",
    ]
    if comparison.savings_percent >= 10:
        suggestions.append("Current AI optimized estimate is in the 10–15% savings band versus common contractor markup.")
    if input_data.floors > 1:
        suggestions.append("For multi-floor projects, start electrical conduit planning before full masonry completion.")
    if any(item.source_count < 2 for item in market_rates):
        suggestions.append("Add more local supplier rates for low-source materials to improve pricing confidence.")
    return suggestions


def _parse_rate_update_text(text: str) -> List[SupplierMaterialPrice]:
    cleaned_lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not cleaned_lines:
        return []
    first_line = cleaned_lines[0].upper()
    if "RATE UPDATE" not in first_line:
        return []
    prices: List[SupplierMaterialPrice] = []
    for line in cleaned_lines[1:]:
        line = line.replace(":", " ")
        parts = [part for part in line.split() if part]
        if len(parts) < 2:
            continue
        material_name = _normalize_material_name(parts[0])
        numeric_text = re.sub(r"[^0-9.]", "", parts[1])
        if not numeric_text:
            continue
        rate = float(numeric_text)
        default_unit = DEFAULT_LOCAL_RATES.get(material_name, {"unit": "unit"})["unit"]
        prices.append(SupplierMaterialPrice(material=material_name, rate=rate, unit=default_unit))
    return prices


async def _insert_market_source_entries(entries: List[MarketSourceEntryCreate]) -> List[MarketSourceEntry]:
    created_entries: List[MarketSourceEntry] = []
    for entry in entries:
        normalized_material = _normalize_material_name(entry.material)
        normalized_rate, normalized_unit = _convert_rate_to_base(normalized_material, entry.rate, entry.unit)
        stored = MarketSourceEntry(
            id=str(uuid.uuid4()),
            source_type=entry.source_type,
            supplier_name=entry.supplier_name,
            location=entry.location,
            material=entry.material,
            rate=entry.rate,
            unit=entry.unit,
            normalized_material=normalized_material,
            normalized_rate=round(normalized_rate, 4),
            normalized_unit=str(normalized_unit),
            source_reference=entry.source_reference,
            collected_at=_now_iso(),
        )
        await db.market_rate_sources.insert_one(stored.model_dump())
        created_entries.append(stored)
    return created_entries


async def _aggregate_market_rates(refresh_frequency: Literal["daily", "weekly"]) -> List[MarketRateItem]:
    days = 1 if refresh_frequency == "daily" else 7
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    source_docs = await db.market_rate_sources.find({"collected_at": {"$gte": cutoff}}, {"_id": 0}).to_list(5000)
    if not source_docs:
        source_docs = await db.market_rate_sources.find({}, {"_id": 0}).to_list(5000)

    grouped: Dict[str, List[dict]] = {material: [] for material in DEFAULT_LOCAL_RATES}
    for doc in source_docs:
        material = _normalize_material_name(doc.get("normalized_material", doc.get("material", "")))
        if material not in grouped:
            continue
        grouped[material].append(doc)

    items: List[MarketRateItem] = []
    for material, docs in grouped.items():
        if docs:
            avg_rate = sum(item.get("normalized_rate", 0) for item in docs) / len(docs)
            cheapest = min(docs, key=lambda item: item.get("normalized_rate", 10**9))
            item = MarketRateItem(
                material=material,
                avg_local_rate=round(avg_rate, 2),
                unit=docs[0].get("normalized_unit", DEFAULT_LOCAL_RATES[material]["unit"]),
                source_count=len(docs),
                cheapest_supplier=cheapest.get("supplier_name"),
                cheapest_rate=round(cheapest.get("normalized_rate", avg_rate), 2),
            )
        else:
            fallback = DEFAULT_LOCAL_RATES[material]
            item = MarketRateItem(
                material=material,
                avg_local_rate=round(fallback["rate"], 2),
                unit=fallback["unit"],
                source_count=0,
                cheapest_supplier="Default Nashik Baseline",
                cheapest_rate=round(fallback["rate"], 2),
            )
        items.append(item)

        date_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await db.market_rate_history.update_one(
            {"material": material, "date": date_key, "refresh_frequency": refresh_frequency},
            {
                "$set": {
                    "avg_rate": item.avg_local_rate,
                    "unit": item.unit,
                    "updated_at": _now_iso(),
                }
            },
            upsert=True,
        )

    await db.market_rate_snapshots.insert_one(
        {
            "id": str(uuid.uuid4()),
            "refresh_frequency": refresh_frequency,
            "last_updated": _now_iso(),
            "items": [entry.model_dump() for entry in items],
        }
    )
    return items


async def _get_market_settings() -> MarketSettings:
    settings_doc = await db.app_settings.find_one({"key": "market_rate_settings"}, {"_id": 0})
    if not settings_doc:
        return MarketSettings(refresh_frequency="weekly")
    try:
        return MarketSettings(refresh_frequency=settings_doc.get("refresh_frequency", "weekly"))
    except ValidationError:
        return MarketSettings(refresh_frequency="weekly")


async def _set_market_settings(payload: MarketSettings) -> MarketSettings:
    await db.app_settings.update_one(
        {"key": "market_rate_settings"},
        {"$set": {"key": "market_rate_settings", "refresh_frequency": payload.refresh_frequency, "updated_at": _now_iso()}},
        upsert=True,
    )
    return payload


def _build_primary_materials_snapshot(primary_quantities: Dict[str, float]) -> List[MaterialQuantity]:
    return [
        MaterialQuantity(name="Cement", quantity=round(primary_quantities["Cement"], 2), unit="bags"),
        MaterialQuantity(name="Sand", quantity=round(primary_quantities["Sand"] * 2.83, 2), unit="m³"),
        MaterialQuantity(name="Steel", quantity=round(primary_quantities["Steel"] / 1000, 3), unit="tons"),
        MaterialQuantity(name="Bricks", quantity=round(primary_quantities["Brick"], 0), unit="nos"),
    ]


def _calculate_estimate(
    input_data: EstimateInput,
    market_rates: List[MarketRateItem],
    supplier_recommendations: List[SupplierRecommendation],
) -> EstimateResult:
    effective_area = input_data.built_up_area_sqft * input_data.floors
    base_rate = BASE_RATE_BY_TYPE[input_data.building_type]
    location_multiplier = _location_multiplier(input_data.location)
    detailed_materials = _build_detailed_materials(effective_area, input_data.building_type)
    primary_quantities = _extract_primary_material_quantities(detailed_materials)

    market_map = {item.material: item for item in market_rates}
    cement_rate = market_map.get("Cement", MarketRateItem(material="Cement", avg_local_rate=DEFAULT_LOCAL_RATES["Cement"]["rate"], unit="bag", source_count=0)).avg_local_rate
    steel_rate = market_map.get("Steel", MarketRateItem(material="Steel", avg_local_rate=DEFAULT_LOCAL_RATES["Steel"]["rate"], unit="kg", source_count=0)).avg_local_rate
    sand_rate = market_map.get("Sand", MarketRateItem(material="Sand", avg_local_rate=DEFAULT_LOCAL_RATES["Sand"]["rate"], unit="brass", source_count=0)).avg_local_rate
    brick_rate = market_map.get("Brick", MarketRateItem(material="Brick", avg_local_rate=DEFAULT_LOCAL_RATES["Brick"]["rate"], unit="nos", source_count=0)).avg_local_rate

    local_material_cost = (
        primary_quantities["Cement"] * cement_rate
        + primary_quantities["Steel"] * steel_rate
        + primary_quantities["Sand"] * sand_rate
        + primary_quantities["Brick"] * brick_rate
    )
    base_structural_cost = effective_area * base_rate * location_multiplier
    other_material_component = base_structural_cost * 0.14
    optimized_material_cost = (local_material_cost + other_material_component) * (1 + (input_data.material_price_variation_pct / 100))
    optimized_material_cost *= 0.91

    labour_cost = (effective_area * 420 * location_multiplier) * (1 + (input_data.labour_cost_adjustment_pct / 100))
    labour_cost *= 0.95
    contractor_profit = (optimized_material_cost + labour_cost) * 0.05
    sub_total = optimized_material_cost + labour_cost + contractor_profit
    gst_tax = sub_total * 0.05
    total_estimate = sub_total + gst_tax

    cost_breakdown = CostBreakdown(
        material_cost=round(optimized_material_cost, 2),
        labour_cost=round(labour_cost, 2),
        contractor_profit=round(contractor_profit, 2),
        gst_tax=round(gst_tax, 2),
        total_estimate=round(total_estimate, 2),
        cost_per_sqft=round(total_estimate / max(effective_area, 1), 2),
    )

    duration_weeks = max(10, min(52, int(6 + (input_data.floors * 4) + (effective_area / 500))))
    phase_weeks = _allocate_phase_weeks(duration_weeks)
    schedule: List[SchedulePhase] = []
    current_week = 1
    for index, phase in enumerate(SCHEDULE_PHASES):
        end_week = current_week + phase_weeks[index] - 1
        schedule.append(
            SchedulePhase(
                phase=phase["name"],
                start_week=current_week,
                end_week=end_week,
                tasks=phase["tasks"],
                milestone=phase["milestone"],
                expected_crew_size=phase["crew_base"] + max(0, input_data.floors - 1) * 2,
            )
        )
        current_week = end_week + 1

    optimized_schedule = _build_optimized_schedule(input_data.floors)
    comparison = _estimate_comparison(cost_breakdown, input_data.contractor_quote)
    suggestions = _build_suggestions(input_data, market_rates, comparison)

    return EstimateResult(
        project_area_sqft=round(effective_area, 2),
        duration_weeks=duration_weeks,
        cost_breakdown=cost_breakdown,
        materials=_build_primary_materials_snapshot(primary_quantities),
        detailed_materials=detailed_materials,
        schedule=schedule,
        optimized_schedule=optimized_schedule,
        local_market_rates=market_rates,
        recommended_suppliers=supplier_recommendations,
        contractor_comparison=comparison,
        estimated_savings_pct=comparison.savings_percent,
        tips=CONSTRUCTION_TIPS,
        suggestions=suggestions,
    )


async def _build_supplier_recommendations() -> List[SupplierRecommendation]:
    docs = await db.supplier_rates.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    best_by_material: Dict[str, SupplierRecommendation] = {}
    for doc in docs:
        supplier_name = doc.get("supplier_name", "Supplier")
        location = doc.get("location", "Nashik")
        for price in doc.get("prices", []):
            material = _normalize_material_name(price.get("material", ""))
            if material not in DEFAULT_LOCAL_RATES:
                continue
            normalized_rate, normalized_unit = _convert_rate_to_base(material, float(price.get("rate", 0)), str(price.get("unit", "")))
            candidate = SupplierRecommendation(
                material=material,
                supplier_name=supplier_name,
                location=location,
                rate=round(normalized_rate, 2),
                unit=str(normalized_unit),
            )
            existing = best_by_material.get(material)
            if not existing or candidate.rate < existing.rate:
                best_by_material[material] = candidate
    return [best_by_material[key] for key in sorted(best_by_material.keys())]


async def _upgrade_saved_project_if_legacy(project_doc: dict) -> SavedProject:
    try:
        return SavedProject(**project_doc)
    except ValidationError:
        input_data = EstimateInput(**project_doc.get("input_data", {}))
        market_rates = await _aggregate_market_rates(input_data.refresh_frequency)
        recommendations = await _build_supplier_recommendations()
        refreshed_result = _calculate_estimate(input_data, market_rates, recommendations)
        upgraded_doc = {
            "id": project_doc.get("id", str(uuid.uuid4())),
            "project_name": project_doc.get("project_name", "Untitled Project"),
            "created_at": project_doc.get("created_at", _now_iso()),
            "input_data": input_data.model_dump(),
            "result": refreshed_result.model_dump(),
        }
        return SavedProject(**upgraded_doc)


def _extract_rate_from_text_window(window_text: str, material: str) -> Optional[float]:
    candidates = re.findall(r"(?:₹|rs\.?|inr)?\s*([0-9]{2,6}(?:\.[0-9]+)?)", window_text, flags=re.IGNORECASE)
    valid_ranges = {
        "Cement": (200, 800),
        "Steel": (35, 120),
        "Sand": (1000, 8000),
        "Brick": (3, 30),
    }
    low, high = valid_ranges[material]
    for text in candidates:
        value = float(text)
        if low <= value <= high:
            return value
    return None


def _scrape_url_for_rates(url: str, location: str) -> List[MarketSourceEntryCreate]:
    entries: List[MarketSourceEntryCreate] = []
    try:
        response = requests.get(url, timeout=12)
        if response.status_code != 200:
            return entries
        text = re.sub(r"<[^>]+>", " ", response.text.lower())
        for alias, material in [("cement", "Cement"), ("steel", "Steel"), ("sand", "Sand"), ("brick", "Brick")]:
            match = re.search(rf"{alias}.{{0,80}}", text)
            if not match:
                continue
            window = match.group(0)
            parsed_rate = _extract_rate_from_text_window(window, material)
            if parsed_rate is None:
                continue
            entries.append(
                MarketSourceEntryCreate(
                    source_type="website",
                    supplier_name="Website Listing",
                    location=location,
                    material=material,
                    rate=parsed_rate,
                    unit=DEFAULT_LOCAL_RATES[material]["unit"],
                    source_reference=url,
                )
            )
    except Exception:
        return []
    return entries


def _extract_json_from_text(raw_text: str) -> dict:
    cleaned = raw_text.strip()
    fenced_match = re.search(r"```json\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
    if fenced_match:
        cleaned = fenced_match.group(1)
    else:
        generic_fence_match = re.search(r"```\s*(\{.*\})\s*```", cleaned, flags=re.DOTALL)
        if generic_fence_match:
            cleaned = generic_fence_match.group(1)

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in AI response")
    return json.loads(cleaned[start : end + 1])


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _dimension_to_meter(value: float, unit: str) -> float:
    normalized_unit = unit.strip().lower()
    if normalized_unit in {"m", "meter", "meters"}:
        return value
    if normalized_unit in {"mm", "millimeter", "millimeters"}:
        return value / 1000
    if normalized_unit in {"cm", "centimeter", "centimeters"}:
        return value / 100
    if normalized_unit in {"ft", "feet", "foot"}:
        return value * 0.3048
    if normalized_unit in {"in", "inch", "inches"}:
        return value * 0.0254
    return value


def _apply_calibration_to_metrics(
    derived_metrics: dict,
    dimensions: List[DrawingDimension],
    calibration_reference_length_m: Optional[float],
) -> DrawingCalibrationInfo:
    if not calibration_reference_length_m or calibration_reference_length_m <= 0:
        return DrawingCalibrationInfo(reference_length_m=None, applied=False, scale_factor=1.0, note="Calibration not provided.")

    detected_lengths = [_dimension_to_meter(item.value, item.unit) for item in dimensions if item.value > 0]
    if not detected_lengths:
        return DrawingCalibrationInfo(
            reference_length_m=round(calibration_reference_length_m, 3),
            applied=False,
            scale_factor=1.0,
            note="Calibration skipped: no readable dimensions found in drawing.",
        )

    detected_reference_m = max(detected_lengths)
    if detected_reference_m <= 0:
        return DrawingCalibrationInfo(
            reference_length_m=round(calibration_reference_length_m, 3),
            applied=False,
            scale_factor=1.0,
            note="Calibration skipped: detected dimension was invalid.",
        )

    scale_factor = calibration_reference_length_m / detected_reference_m
    if scale_factor < 0.3 or scale_factor > 3.0:
        return DrawingCalibrationInfo(
            reference_length_m=round(calibration_reference_length_m, 3),
            applied=False,
            scale_factor=round(scale_factor, 4),
            note="Calibration skipped: scale factor out of safe range.",
        )

    area_keys = ["wall_area_m2", "plaster_area_m2", "flooring_area_m2"]
    volume_keys = ["concrete_volume_m3", "brickwork_m3"]
    count_keys = ["brick_quantity_no", "steel_quantity_ton"]

    for key in area_keys:
        derived_metrics[key] = _safe_float(derived_metrics.get(key)) * (scale_factor**2)
    for key in volume_keys:
        derived_metrics[key] = _safe_float(derived_metrics.get(key)) * (scale_factor**3)
    for key in count_keys:
        derived_metrics[key] = _safe_float(derived_metrics.get(key)) * (scale_factor**3)

    return DrawingCalibrationInfo(
        reference_length_m=round(calibration_reference_length_m, 3),
        applied=True,
        scale_factor=round(scale_factor, 4),
        note="Calibration applied using provided reference length.",
    )


def _boq_confidence(item_name: str, has_dimensions: bool, quantity_mode: str, warnings: List[DrawingWarning]) -> tuple[float, Literal["high", "medium", "low"]]:
    high_warnings = len([warn for warn in warnings if warn.severity == "high"])
    structural_items = {"Wall Area", "Concrete", "Brickwork", "Brick Quantity", "Steel"}

    score = 0.88 if has_dimensions else 0.64
    if item_name in structural_items and quantity_mode in {"strict", "hybrid"} and not has_dimensions:
        score -= 0.16
    if item_name not in structural_items and quantity_mode in {"assisted", "hybrid"} and not has_dimensions:
        score -= 0.08

    score -= high_warnings * 0.05
    score = max(0.35, min(score, 0.98))

    if score >= 0.8:
        level: Literal["high", "medium", "low"] = "high"
    elif score >= 0.6:
        level = "medium"
    else:
        level = "low"
    return round(score, 2), level


def _default_drawing_payload() -> dict:
    return {
        "detected_elements": {"walls": 12, "rooms": 5, "columns": 10, "doors": 8, "windows": 6, "staircases": 1, "slabs": 2},
        "dimensions": [],
        "room_labels": [],
        "wall_thickness_mm": [115, 230],
        "derived_metrics": {
            "wall_area_m2": 180,
            "concrete_volume_m3": 82,
            "brickwork_m3": 118,
            "brick_quantity_no": 59000,
            "steel_quantity_ton": 6.2,
            "plaster_area_m2": 640,
            "flooring_area_m2": 220,
        },
        "warnings": [{"severity": "medium", "message": "Some dimensions were unclear; finishing values include assisted assumptions."}],
        "assumptions": ["Default residential grid and room proportions used for missing finishing dimensions."],
    }


def _prepare_drawing_asset(uploaded_path: str, extension: str) -> tuple[str, str]:
    if extension in {"png", "jpg", "jpeg"}:
        mime = "image/png" if extension == "png" else "image/jpeg"
        return uploaded_path, mime

    if extension == "pdf":
        pdf_doc = fitz.open(uploaded_path)
        if pdf_doc.page_count == 0:
            raise HTTPException(status_code=400, detail="PDF has no pages")
        page = pdf_doc.load_page(0)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        image_path = os.path.join(tempfile.gettempdir(), f"drawing-page-{uuid.uuid4()}.png")
        pix.save(image_path)
        pdf_doc.close()
        return image_path, "image/png"

    raise HTTPException(status_code=400, detail="Unsupported drawing format")


async def _run_drawing_ai_analysis(image_path: str, mime_type: str, quantity_mode: Literal["strict", "assisted", "hybrid"]) -> dict:
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY missing")

    chat = LlmChat(
        api_key=llm_key,
        session_id=f"drawing-analysis-{uuid.uuid4()}",
        system_message=DRAWING_ANALYZER_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-5.2")

    prompt = (
        "Analyze this construction drawing and return ONLY valid JSON. "
        f"Use quantity mode: {quantity_mode}. "
        "For HYBRID mode, keep structural values strict and use assisted estimates for finishing values when data is missing. "
        "JSON schema example: "
        f"{json.dumps(DRAWING_JSON_SCHEMA_NOTE)}"
    )

    response_text = await chat.send_message(
        UserMessage(
            text=prompt,
            file_contents=[FileContentWithMimeType(file_path=image_path, mime_type=mime_type)],
        )
    )
    return _extract_json_from_text(str(response_text))


def _build_drawing_boq(
    derived_metrics: dict,
    quantity_mode: Literal["strict", "assisted", "hybrid"],
    warnings: List[DrawingWarning],
    has_dimensions: bool,
) -> List[DrawingBoqItem]:
    def _item(item_name: str, metric_key: str, unit: str, digits: int = 2) -> DrawingBoqItem:
        quantity_value = round(_safe_float(derived_metrics.get(metric_key)), digits)
        confidence_score, confidence_level = _boq_confidence(item_name, has_dimensions, quantity_mode, warnings)
        return DrawingBoqItem(
            item=item_name,
            quantity=quantity_value,
            unit=unit,
            confidence_score=confidence_score,
            confidence_level=confidence_level,
        )

    return [
        _item("Wall Area", "wall_area_m2", "m²"),
        _item("Concrete", "concrete_volume_m3", "m³"),
        _item("Brickwork", "brickwork_m3", "m³"),
        _item("Brick Quantity", "brick_quantity_no", "nos", 0),
        _item("Steel", "steel_quantity_ton", "tons", 3),
        _item("Plaster", "plaster_area_m2", "m²"),
        _item("Flooring", "flooring_area_m2", "m²"),
    ]


def _calculate_drawing_cost(
    derived_metrics: dict,
    market_rates: List[MarketRateItem],
    location: str,
    building_type: Literal["Basic", "Standard", "Premium"],
    floors: int,
) -> DrawingCostEstimate:
    rates_map = {item.material: item.avg_local_rate for item in market_rates}
    cement_rate = rates_map.get("Cement", DEFAULT_LOCAL_RATES["Cement"]["rate"])
    steel_rate = rates_map.get("Steel", DEFAULT_LOCAL_RATES["Steel"]["rate"])
    sand_rate = rates_map.get("Sand", DEFAULT_LOCAL_RATES["Sand"]["rate"])
    brick_rate = rates_map.get("Brick", DEFAULT_LOCAL_RATES["Brick"]["rate"])

    concrete_m3 = _safe_float(derived_metrics.get("concrete_volume_m3"))
    plaster_m2 = _safe_float(derived_metrics.get("plaster_area_m2"))
    steel_ton = _safe_float(derived_metrics.get("steel_quantity_ton"))
    brick_no = _safe_float(derived_metrics.get("brick_quantity_no"))
    brickwork_m3 = _safe_float(derived_metrics.get("brickwork_m3"))
    flooring_m2 = _safe_float(derived_metrics.get("flooring_area_m2"))

    cement_bags = (concrete_m3 * 8.0) + (plaster_m2 * 0.12)
    sand_brass = (concrete_m3 * 0.44) + (plaster_m2 * 0.015)
    steel_kg = steel_ton * 1000

    quality_factor = {"Basic": 0.96, "Standard": 1.0, "Premium": 1.08}[building_type]
    location_factor = _location_multiplier(location)
    floor_factor = max(1, floors) ** 0.05

    material_cost = (
        (cement_bags * cement_rate)
        + (steel_kg * steel_rate)
        + (sand_brass * sand_rate)
        + (brick_no * brick_rate)
    )
    labour_cost = (concrete_m3 * 1400) + (brickwork_m3 * 900) + (plaster_m2 * 70) + (flooring_m2 * 110)
    material_cost *= quality_factor * location_factor * floor_factor
    labour_cost *= location_factor * floor_factor
    total_estimate = material_cost + labour_cost

    return DrawingCostEstimate(
        material_cost=round(material_cost, 2),
        labour_cost=round(labour_cost, 2),
        total_estimate=round(total_estimate, 2),
    )


def _build_drawing_schedule(derived_metrics: dict) -> List[DrawingScheduleStage]:
    concrete_m3 = _safe_float(derived_metrics.get("concrete_volume_m3"))
    brickwork_m3 = _safe_float(derived_metrics.get("brickwork_m3"))
    plaster_m2 = _safe_float(derived_metrics.get("plaster_area_m2"))
    steel_ton = _safe_float(derived_metrics.get("steel_quantity_ton"))

    return [
        DrawingScheduleStage(stage="Excavation", duration_days=max(3, int(concrete_m3 / 22) + 2), can_run_parallel=False),
        DrawingScheduleStage(stage="Foundation", duration_days=max(7, int(concrete_m3 / 16) + 4), can_run_parallel=False),
        DrawingScheduleStage(stage="Structure", duration_days=max(14, int(steel_ton * 2) + 8), can_run_parallel=False),
        DrawingScheduleStage(stage="Brickwork", duration_days=max(10, int(brickwork_m3 / 14) + 6), can_run_parallel=True, parallel_with="MEP Rough-Ins"),
        DrawingScheduleStage(stage="MEP Rough-Ins", duration_days=max(8, int(plaster_m2 / 130) + 4), can_run_parallel=True, parallel_with="Brickwork"),
        DrawingScheduleStage(stage="Finishing", duration_days=max(15, int(plaster_m2 / 95) + 8), can_run_parallel=False),
    ]


def _enrich_drawing_warnings(
    ai_warnings: list,
    dimensions: list,
    wall_thickness_mm: list,
    detected_elements: dict,
) -> List[DrawingWarning]:
    warnings: List[DrawingWarning] = []
    for item in ai_warnings or []:
        message = str(item.get("message", "")).strip()
        severity = str(item.get("severity", "medium")).lower()
        if not message:
            continue
        warnings.append(DrawingWarning(severity="high" if severity not in {"high", "medium", "low"} else severity, message=message))

    if not dimensions:
        warnings.append(DrawingWarning(severity="high", message="Missing dimensions detected in drawing."))

    if wall_thickness_mm:
        min_th = min(wall_thickness_mm)
        max_th = max(wall_thickness_mm)
        if max_th - min_th > 140:
            warnings.append(DrawingWarning(severity="medium", message="Irregular wall thickness detected across plan zones."))

    rooms = int(_safe_float(detected_elements.get("rooms"), 0))
    walls = int(_safe_float(detected_elements.get("walls"), 0))
    if rooms > 0 and walls < rooms:
        warnings.append(DrawingWarning(severity="high", message="Potential structural inconsistency: wall count appears low for detected room count."))

    if not warnings:
        warnings.append(DrawingWarning(severity="low", message="No major design inconsistencies detected from visible drawing details."))

    return warnings


def _build_manual_vs_ai_comparison(
    derived_metrics: dict,
    manual_boq: Optional[dict],
) -> tuple[List[DrawingManualComparisonRow], DrawingTimeComparison]:
    ai_values = {
        "Brickwork": _safe_float(derived_metrics.get("brickwork_m3")),
        "Concrete": _safe_float(derived_metrics.get("concrete_volume_m3")),
        "Steel": _safe_float(derived_metrics.get("steel_quantity_ton")),
        "Plaster": _safe_float(derived_metrics.get("plaster_area_m2")),
    }
    manual_input = manual_boq or {}
    rows: List[DrawingManualComparisonRow] = []
    for item, ai_value in ai_values.items():
        manual_value = _safe_float(manual_input.get(item), ai_value * 1.08)
        variance = ((manual_value - ai_value) / ai_value * 100) if ai_value else 0
        rows.append(
            DrawingManualComparisonRow(
                item=item,
                manual_quantity=round(manual_value, 2),
                ai_quantity=round(ai_value, 2),
                variance_pct=round(variance, 2),
            )
        )

    manual_time_hours = _safe_float(manual_input.get("manual_time_hours"), 4)
    time_comparison = DrawingTimeComparison(
        manual_time_required=f"{manual_time_hours:.1f} hours",
        ai_time_required="10 seconds",
    )
    return rows, time_comparison


def _normalize_saved_drawing_analysis(doc: dict) -> DrawingAnalysisResponse:
    payload = dict(doc)
    payload.setdefault("project_name", "Untitled Drawing")
    payload.setdefault(
        "calibration",
        {
            "reference_length_m": None,
            "applied": False,
            "scale_factor": 1.0,
            "note": "Calibration not available for legacy analysis.",
        },
    )

    normalized_warnings = [DrawingWarning(**warning) for warning in payload.get("warnings", []) if isinstance(warning, dict)]
    has_dimensions = bool(payload.get("dimensions"))
    quantity_mode = payload.get("quantity_mode", "hybrid")

    normalized_boq = []
    for item in payload.get("boq_items", []):
        if not isinstance(item, dict):
            continue
        if "confidence_score" in item and "confidence_level" in item:
            normalized_boq.append(item)
            continue
        score, level = _boq_confidence(str(item.get("item", "Item")), has_dimensions, quantity_mode, normalized_warnings)
        normalized_boq.append(
            {
                "item": item.get("item", "Item"),
                "quantity": _safe_float(item.get("quantity")),
                "unit": item.get("unit", "unit"),
                "confidence_score": score,
                "confidence_level": level,
            }
        )
    payload["boq_items"] = normalized_boq

    return DrawingAnalysisResponse(**payload)


def _build_analysis_summary(analysis: DrawingAnalysisResponse) -> DrawingAnalysisSummary:
    return DrawingAnalysisSummary(
        analysis_id=analysis.analysis_id,
        project_name=analysis.project_name,
        file_name=analysis.file_name,
        generated_at=analysis.generated_at,
        total_estimate=round(analysis.cost_estimate.total_estimate, 2),
        warning_count=len(analysis.warnings),
    )


@api_router.get("/")
async def root():
    return {"message": "AI Estimate Pro API is running"}


@api_router.get("/market-rates/settings", response_model=MarketSettings)
async def get_market_settings():
    return await _get_market_settings()


@api_router.post("/market-rates/settings", response_model=MarketSettings)
async def update_market_settings(payload: MarketSettings):
    return await _set_market_settings(payload)


@api_router.get("/market-rates", response_model=MarketRatesResponse)
async def get_market_rates(refresh_frequency: Optional[Literal["daily", "weekly"]] = Query(default=None)):
    settings = await _get_market_settings()
    frequency = refresh_frequency or settings.refresh_frequency
    items = await _aggregate_market_rates(frequency)
    return MarketRatesResponse(refresh_frequency=frequency, last_updated=_now_iso(), items=items)


@api_router.post("/market-rates/sources", response_model=List[MarketSourceEntry])
async def create_market_source_entries(payload: List[MarketSourceEntryCreate]):
    return await _insert_market_source_entries(payload)


@api_router.post("/market-rates/scrape", response_model=ScrapeResponse)
async def scrape_market_rates(payload: ScrapeRequest):
    all_entries: List[MarketSourceEntryCreate] = []
    for url in payload.urls:
        all_entries.extend(_scrape_url_for_rates(url, payload.location))
    if all_entries:
        await _insert_market_source_entries(all_entries)
    return ScrapeResponse(processed_urls=len(payload.urls), created_entries=len(all_entries))


@api_router.get("/market-rates/trends", response_model=MaterialTrendResponse)
async def get_market_rate_trend(material: str = "Cement", days: int = 90):
    normalized_material = _normalize_material_name(material)
    points = await db.market_rate_history.find(
        {"material": normalized_material},
        {"_id": 0, "date": 1, "avg_rate": 1},
    ).sort("date", 1).to_list(max(10, min(days, 180)))
    return MaterialTrendResponse(
        material=normalized_material,
        unit=DEFAULT_LOCAL_RATES.get(normalized_material, {"unit": "unit"})["unit"],
        points=[TrendPoint(date=item["date"], avg_rate=round(item["avg_rate"], 2)) for item in points],
    )


@api_router.post("/suppliers/rates", response_model=SupplierRateRecord)
async def submit_supplier_rates(payload: SupplierRateSubmission):
    record = SupplierRateRecord(
        id=str(uuid.uuid4()),
        supplier_name=payload.supplier_name,
        location=payload.location,
        prices=payload.prices,
        source_type="supplier_manual",
        updated_at=_now_iso(),
    )
    await db.supplier_rates.insert_one(record.model_dump())
    source_entries = [
        MarketSourceEntryCreate(
            source_type="supplier_manual",
            supplier_name=payload.supplier_name,
            location=payload.location,
            material=price.material,
            rate=price.rate,
            unit=price.unit,
            source_reference="supplier-dashboard",
        )
        for price in payload.prices
    ]
    await _insert_market_source_entries(source_entries)
    return record


@api_router.get("/suppliers/rates", response_model=List[SupplierRateRecord])
async def list_supplier_rates(limit: int = 50):
    safe_limit = max(1, min(limit, 200))
    records = await db.supplier_rates.find({}, {"_id": 0}).sort("updated_at", -1).limit(safe_limit).to_list(safe_limit)
    return [SupplierRateRecord(**record) for record in records]


@api_router.get("/whatsapp/status")
async def get_whatsapp_status():
    return {
        "configured": bool(os.environ.get("WHATSAPP_VERIFY_TOKEN")),
        "mode": "meta-cloud-api-webhook",
        "recommended_for_free_start": "Meta WhatsApp Cloud API trial/free-start",
    }


@api_router.get("/whatsapp/webhook")
async def verify_whatsapp_webhook(
    hub_mode: Optional[str] = Query(default=None, alias="hub.mode"),
    hub_verify_token: Optional[str] = Query(default=None, alias="hub.verify_token"),
    hub_challenge: Optional[str] = Query(default=None, alias="hub.challenge"),
):
    verify_token = os.environ.get("WHATSAPP_VERIFY_TOKEN")
    if not verify_token:
        raise HTTPException(status_code=500, detail="WHATSAPP_VERIFY_TOKEN not configured")
    if hub_mode == "subscribe" and hub_verify_token == verify_token:
        return int(hub_challenge) if hub_challenge and hub_challenge.isdigit() else str(hub_challenge)
    raise HTTPException(status_code=403, detail="Webhook verification failed")


@api_router.post("/whatsapp/webhook")
async def receive_whatsapp_webhook(payload: dict):
    messages = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            messages.extend(change.get("value", {}).get("messages", []))

    created_count = 0
    for message in messages:
        if message.get("type") != "text":
            continue
        phone = message.get("from", "unknown")
        text = message.get("text", {}).get("body", "")
        prices = _parse_rate_update_text(text)
        if not prices:
            continue
        supplier_submission = SupplierRateSubmission(
            supplier_name=f"WA-{phone}",
            location="Nashik",
            prices=prices,
        )
        await submit_supplier_rates(supplier_submission)
        await db.whatsapp_rate_updates.insert_one(
            {
                "id": str(uuid.uuid4()),
                "phone": phone,
                "raw_text": text,
                "parsed_prices": [item.model_dump() for item in prices],
                "created_at": _now_iso(),
            }
        )
        created_count += 1
    return {"status": "ok", "processed_updates": created_count}


@api_router.post("/drawing-analyzer/analyze", response_model=DrawingAnalysisResponse)
async def analyze_drawing(
    drawing_file: UploadFile = File(...),
    project_name: str = Form("Untitled Drawing"),
    location: str = Form("Nashik"),
    building_type: Literal["Basic", "Standard", "Premium"] = Form("Standard"),
    floors: int = Form(1),
    refresh_frequency: Literal["daily", "weekly"] = Form("weekly"),
    quantity_mode: Literal["strict", "assisted", "hybrid"] = Form("hybrid"),
    calibration_reference_length_m: Optional[float] = Form(None),
    manual_boq_json: Optional[str] = Form(None),
):
    file_name = drawing_file.filename or "uploaded-drawing"
    extension = file_name.split(".")[-1].lower() if "." in file_name else ""
    if extension not in {"png", "jpg", "jpeg", "pdf"}:
        raise HTTPException(status_code=400, detail="Supported formats: PNG, JPG, PDF")

    uploaded_temp_path = os.path.join(tempfile.gettempdir(), f"drawing-upload-{uuid.uuid4()}.{extension}")
    with open(uploaded_temp_path, "wb") as uploaded_file:
        uploaded_file.write(await drawing_file.read())

    image_path = uploaded_temp_path
    try:
        image_path, mime_type = _prepare_drawing_asset(uploaded_temp_path, extension)
        try:
            ai_payload = await _run_drawing_ai_analysis(image_path, mime_type, quantity_mode)
        except Exception as error:
            logger.exception("Drawing AI analysis failed")
            ai_payload = _default_drawing_payload()
            ai_payload["warnings"] = ai_payload.get("warnings", []) + [
                {"severity": "medium", "message": f"AI interpretation fallback applied: {str(error)[:180]}"}
            ]

        detected_elements_raw = ai_payload.get("detected_elements", _default_drawing_payload()["detected_elements"])
        detected_elements = DrawingDetectedElements(
            walls=int(_safe_float(detected_elements_raw.get("walls"), 0)),
            rooms=int(_safe_float(detected_elements_raw.get("rooms"), 0)),
            columns=int(_safe_float(detected_elements_raw.get("columns"), 0)),
            doors=int(_safe_float(detected_elements_raw.get("doors"), 0)),
            windows=int(_safe_float(detected_elements_raw.get("windows"), 0)),
            staircases=int(_safe_float(detected_elements_raw.get("staircases"), 0)),
            slabs=int(_safe_float(detected_elements_raw.get("slabs"), 0)),
        )

        dimensions_raw = ai_payload.get("dimensions", [])
        dimensions = [
            DrawingDimension(
                label=str(item.get("label", "Unnamed Dimension")),
                value=round(_safe_float(item.get("value")), 2),
                unit=str(item.get("unit", "m")),
            )
            for item in dimensions_raw
            if isinstance(item, dict)
        ]
        room_labels = [str(item) for item in ai_payload.get("room_labels", []) if str(item).strip()]
        wall_thickness_mm = [round(_safe_float(value), 2) for value in ai_payload.get("wall_thickness_mm", []) if _safe_float(value) > 0]
        derived_metrics = ai_payload.get("derived_metrics", _default_drawing_payload()["derived_metrics"])

        if floors > 1:
            derived_metrics["wall_area_m2"] = _safe_float(derived_metrics.get("wall_area_m2")) * floors
            derived_metrics["concrete_volume_m3"] = _safe_float(derived_metrics.get("concrete_volume_m3")) * floors
            derived_metrics["brickwork_m3"] = _safe_float(derived_metrics.get("brickwork_m3")) * floors
            derived_metrics["brick_quantity_no"] = _safe_float(derived_metrics.get("brick_quantity_no")) * floors
            derived_metrics["steel_quantity_ton"] = _safe_float(derived_metrics.get("steel_quantity_ton")) * floors
            derived_metrics["plaster_area_m2"] = _safe_float(derived_metrics.get("plaster_area_m2")) * floors
            derived_metrics["flooring_area_m2"] = _safe_float(derived_metrics.get("flooring_area_m2")) * floors

        calibration_info = _apply_calibration_to_metrics(derived_metrics, dimensions, calibration_reference_length_m)

        market_rates = await _aggregate_market_rates(refresh_frequency)
        warnings = _enrich_drawing_warnings(
            ai_payload.get("warnings", []),
            dimensions_raw,
            wall_thickness_mm,
            detected_elements_raw,
        )
        boq_items = _build_drawing_boq(derived_metrics, quantity_mode, warnings, bool(dimensions))
        cost_estimate = _calculate_drawing_cost(derived_metrics, market_rates, location, building_type, floors)
        optimized_schedule = _build_drawing_schedule(derived_metrics)

        manual_boq = None
        if manual_boq_json:
            try:
                manual_boq = json.loads(manual_boq_json)
            except json.JSONDecodeError:
                manual_boq = None

        comparison_rows, method_time = _build_manual_vs_ai_comparison(derived_metrics, manual_boq)
        assumptions = [str(item) for item in ai_payload.get("assumptions", []) if str(item).strip()]

        if quantity_mode == "strict" and not dimensions:
            warnings.insert(0, DrawingWarning(severity="high", message="Strict mode: structural quantities may be limited due to missing dimensions."))
        if quantity_mode == "hybrid" and not assumptions:
            assumptions.append("Hybrid mode used assisted assumptions for finishing quantities where dimensions were not clearly readable.")

        analysis = DrawingAnalysisResponse(
            analysis_id=str(uuid.uuid4()),
            project_name=project_name.strip() or "Untitled Drawing",
            file_name=file_name,
            file_type=extension,
            quantity_mode=quantity_mode,
            detected_elements=detected_elements,
            dimensions=dimensions,
            room_labels=room_labels,
            wall_thickness_mm=wall_thickness_mm,
            boq_items=boq_items,
            market_rates_used=market_rates,
            cost_estimate=cost_estimate,
            warnings=warnings,
            assumptions=assumptions,
            calibration=calibration_info,
            optimized_schedule=optimized_schedule,
            manual_vs_ai_quantities=comparison_rows,
            method_time_comparison=method_time,
            generated_at=_now_iso(),
        )

        await db.drawing_analyses.insert_one(analysis.model_dump())
        return analysis
    finally:
        if os.path.exists(uploaded_temp_path):
            os.remove(uploaded_temp_path)
        if image_path != uploaded_temp_path and os.path.exists(image_path):
            os.remove(image_path)


@api_router.get("/drawing-analyzer/history", response_model=List[DrawingAnalysisSummary])
async def list_drawing_analysis_history(limit: int = 20):
    safe_limit = max(1, min(limit, 100))
    records = await db.drawing_analyses.find({}, {"_id": 0}).sort("generated_at", -1).limit(safe_limit).to_list(safe_limit)
    summaries: List[DrawingAnalysisSummary] = []
    for record in records:
        try:
            analysis = _normalize_saved_drawing_analysis(record)
            summaries.append(_build_analysis_summary(analysis))
        except ValidationError:
            continue
    return summaries


@api_router.get("/drawing-analyzer/compare", response_model=DrawingAnalysisComparisonResponse)
async def compare_drawing_analyses(base_analysis_id: str, target_analysis_id: str):
    base_record = await db.drawing_analyses.find_one({"analysis_id": base_analysis_id}, {"_id": 0})
    target_record = await db.drawing_analyses.find_one({"analysis_id": target_analysis_id}, {"_id": 0})
    if not base_record or not target_record:
        raise HTTPException(status_code=404, detail="One or both analysis records not found")

    base_analysis = _normalize_saved_drawing_analysis(base_record)
    target_analysis = _normalize_saved_drawing_analysis(target_record)

    base_boq_map = {item.item: item.quantity for item in base_analysis.boq_items}
    target_boq_map = {item.item: item.quantity for item in target_analysis.boq_items}
    all_items = sorted(set(base_boq_map.keys()) | set(target_boq_map.keys()))
    boq_deltas: List[DrawingBoqDelta] = []

    for item_name in all_items:
        base_qty = _safe_float(base_boq_map.get(item_name))
        target_qty = _safe_float(target_boq_map.get(item_name))
        delta_qty = target_qty - base_qty
        delta_percent = (delta_qty / base_qty * 100) if base_qty else 0
        boq_deltas.append(
            DrawingBoqDelta(
                item=item_name,
                base_quantity=round(base_qty, 3),
                target_quantity=round(target_qty, 3),
                delta_quantity=round(delta_qty, 3),
                delta_percent=round(delta_percent, 2),
            )
        )

    base_duration = sum(item.duration_days for item in base_analysis.optimized_schedule)
    target_duration = sum(item.duration_days for item in target_analysis.optimized_schedule)

    return DrawingAnalysisComparisonResponse(
        base_analysis_id=base_analysis.analysis_id,
        target_analysis_id=target_analysis.analysis_id,
        base_project_name=base_analysis.project_name,
        target_project_name=target_analysis.project_name,
        cost_delta=round(target_analysis.cost_estimate.total_estimate - base_analysis.cost_estimate.total_estimate, 2),
        duration_delta_days=target_duration - base_duration,
        boq_deltas=boq_deltas,
    )


@api_router.post("/estimate", response_model=EstimateResult)
async def calculate_estimate(input_data: EstimateInput):
    market_rates = await _aggregate_market_rates(input_data.refresh_frequency)
    recommendations = await _build_supplier_recommendations()
    return _calculate_estimate(input_data, market_rates, recommendations)


@api_router.post("/projects", response_model=SavedProject)
async def save_project(payload: SaveProjectRequest):
    market_rates = await _aggregate_market_rates(payload.input_data.refresh_frequency)
    recommendations = await _build_supplier_recommendations()
    result = _calculate_estimate(payload.input_data, market_rates, recommendations)
    project = SavedProject(
        id=str(uuid.uuid4()),
        project_name=payload.project_name,
        created_at=_now_iso(),
        input_data=payload.input_data,
        result=result,
    )
    await db.saved_projects.insert_one(project.model_dump())
    return project


@api_router.get("/projects", response_model=List[SavedProject])
async def list_projects(limit: int = 20):
    safe_limit = max(1, min(limit, 100))
    projects = await db.saved_projects.find({}, {"_id": 0}).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)
    normalized: List[SavedProject] = []
    for project in projects:
        normalized_project = await _upgrade_saved_project_if_legacy(project)
        normalized.append(normalized_project)
    return normalized


@api_router.get("/projects/{project_id}", response_model=SavedProject)
async def get_project(project_id: str):
    project = await db.saved_projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _upgrade_saved_project_if_legacy(project)


@api_router.post("/chat/session", response_model=ChatSessionResponse)
async def create_chat_session():
    return ChatSessionResponse(session_id=str(uuid.uuid4()))


@api_router.get("/chat/history/{session_id}", response_model=List[ChatHistoryItem])
async def get_chat_history(session_id: str, limit: int = 30):
    safe_limit = max(1, min(limit, 100))
    records = await db.chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).limit(safe_limit).to_list(safe_limit)
    return [ChatHistoryItem(**record) for record in records]


@api_router.post("/chat/message", response_model=ChatMessageResponse)
async def send_chat_message(payload: ChatMessageRequest):
    llm_key = os.environ.get("EMERGENT_LLM_KEY")
    if not llm_key:
        raise HTTPException(status_code=500, detail="LLM key is not configured")

    user_record = ChatHistoryItem(
        id=str(uuid.uuid4()),
        session_id=payload.session_id,
        role="user",
        text=payload.message,
        created_at=_now_iso(),
    )
    await db.chat_messages.insert_one(user_record.model_dump())

    recent_records = await db.chat_messages.find({"session_id": payload.session_id}, {"_id": 0}).sort("created_at", -1).limit(12).to_list(12)
    recent_records.reverse()
    history_lines = [f"{item['role'].capitalize()}: {item['text']}" for item in recent_records]
    history_text = "\n".join(history_lines)
    context_block = payload.project_context or "No project context provided."
    final_prompt = f"Project context:\n{context_block}\n\nRecent conversation:\n{history_text}\n\nLatest user message: {payload.message}"

    chat = LlmChat(api_key=llm_key, session_id=payload.session_id, system_message=CHAT_SYSTEM_PROMPT).with_model("openai", "gpt-5.2")
    try:
        reply_text = await chat.send_message(UserMessage(text=final_prompt))
    except Exception as error:
        logger.exception("Chat response failed")
        raise HTTPException(status_code=500, detail=f"Chat service unavailable: {error}")

    assistant_record = ChatHistoryItem(
        id=str(uuid.uuid4()),
        session_id=payload.session_id,
        role="assistant",
        text=str(reply_text).strip(),
        created_at=_now_iso(),
    )
    await db.chat_messages.insert_one(assistant_record.model_dump())
    return ChatMessageResponse(session_id=payload.session_id, reply=assistant_record.text, created_at=assistant_record.created_at)


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()