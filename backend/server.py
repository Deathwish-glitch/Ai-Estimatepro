import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage
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

BASE_RATE_BY_TYPE: Dict[str, float] = {
    "Basic": 1800,
    "Standard": 2300,
    "Premium": 3000,
}

MATERIAL_FACTOR_BY_TYPE: Dict[str, float] = {
    "Basic": 0.95,
    "Standard": 1.0,
    "Premium": 1.08,
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
        "tasks": [
            "Site survey and layout marking",
            "Temporary utilities setup",
            "Material storage and safety zoning",
        ],
        "milestone": "Site ready for excavation",
        "crew_base": 6,
    },
    {
        "name": "Excavation and Earthwork",
        "tasks": [
            "Excavation to design depth",
            "Soil disposal and leveling",
            "Compaction checks",
        ],
        "milestone": "Excavation approved",
        "crew_base": 10,
    },
    {
        "name": "Foundation and Plinth",
        "tasks": [
            "PCC bed and footing reinforcement",
            "Footing and plinth concrete",
            "Anti-termite and waterproofing treatment",
        ],
        "milestone": "Plinth beam completed",
        "crew_base": 12,
    },
    {
        "name": "RCC Frame and Slabs",
        "tasks": [
            "Column casting and shuttering",
            "Beam and slab reinforcement",
            "Concrete pouring and curing cycle",
        ],
        "milestone": "Structural frame topped out",
        "crew_base": 16,
    },
    {
        "name": "Masonry and Roofing",
        "tasks": [
            "External and partition block work",
            "Lintel and sill casting",
            "Roof weatherproof treatment",
        ],
        "milestone": "Shell construction closed",
        "crew_base": 14,
    },
    {
        "name": "MEP Rough-Ins",
        "tasks": [
            "Electrical conduit and box fixing",
            "Plumbing and drainage routing",
            "Pressure and leakage pre-tests",
        ],
        "milestone": "MEP rough-ins approved",
        "crew_base": 10,
    },
    {
        "name": "Finishing and Fixtures",
        "tasks": [
            "Plastering, putty and primer",
            "Flooring and wall tile works",
            "Painting, carpentry and fixture installation",
        ],
        "milestone": "Interior finishes complete",
        "crew_base": 15,
    },
    {
        "name": "Testing and Handover",
        "tasks": [
            "Final electrical and plumbing testing",
            "Snag corrections and cleaning",
            "Handover walkthrough and documentation",
        ],
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


class EstimateInput(BaseModel):
    plot_size_sqft: float = Field(gt=0)
    built_up_area_sqft: float = Field(gt=0)
    floors: int = Field(ge=1, le=5)
    building_type: Literal["Basic", "Standard", "Premium"]
    location: str = Field(min_length=2, max_length=100)
    labour_cost_adjustment_pct: float = Field(default=0, ge=-30, le=60)
    material_price_variation_pct: float = Field(default=0, ge=-30, le=60)


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


class EstimateResult(BaseModel):
    project_area_sqft: float
    duration_weeks: int
    cost_breakdown: CostBreakdown
    materials: List[MaterialQuantity]
    detailed_materials: List[DetailedMaterialItem]
    schedule: List[SchedulePhase]
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


def _location_multiplier(location: str) -> float:
    normalized = location.strip().lower()
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


def _build_suggestions(input_data: EstimateInput, duration_weeks: int, cost_breakdown: CostBreakdown) -> List[str]:
    suggestions = [
        "Keep a 7% contingency buffer for market price and on-site variation.",
        "Plan procurement in batches by phase to reduce material wastage and theft risk.",
        "Create a weekly review checklist for quality, safety, and budget tracking.",
    ]
    if input_data.floors > 1:
        suggestions.append("For multi-floor projects, lock shuttering and reinforcement vendors early.")
    if input_data.material_price_variation_pct > 15:
        suggestions.append("Material variation is high; compare 2-3 suppliers before final purchase orders.")
    if duration_weeks > 24:
        suggestions.append("Long schedules benefit from a phase-wise cash flow plan to avoid work stoppage.")
    if cost_breakdown.total_estimate > 10_000_000:
        suggestions.append("Consider milestone-based contractor payments linked to quality approvals.")
    return suggestions


def _calculate_estimate(input_data: EstimateInput) -> EstimateResult:
    effective_area = input_data.built_up_area_sqft * input_data.floors
    base_rate = BASE_RATE_BY_TYPE[input_data.building_type]
    location_multiplier = _location_multiplier(input_data.location)

    base_cost = effective_area * base_rate * location_multiplier
    material_cost = base_cost * 0.55 * (1 + (input_data.material_price_variation_pct / 100))
    labour_cost = base_cost * 0.3 * (1 + (input_data.labour_cost_adjustment_pct / 100))
    contractor_profit = (material_cost + labour_cost) * 0.08
    sub_total = material_cost + labour_cost + contractor_profit
    gst_tax = sub_total * 0.05
    total_estimate = sub_total + gst_tax

    type_factor = MATERIAL_FACTOR_BY_TYPE[input_data.building_type]
    detailed_materials = _build_detailed_materials(effective_area, input_data.building_type)
    materials = [
        MaterialQuantity(name="Cement", quantity=round(effective_area * 0.43 * type_factor, 2), unit="bags"),
        MaterialQuantity(name="Sand", quantity=round(effective_area * 0.028 * type_factor, 2), unit="m³"),
        MaterialQuantity(name="Aggregate", quantity=round(effective_area * 0.024 * type_factor, 2), unit="m³"),
        MaterialQuantity(name="Steel", quantity=round(effective_area * 0.0031 * type_factor, 3), unit="tons"),
        MaterialQuantity(name="Bricks", quantity=round(effective_area * 8.4 * type_factor, 0), unit="nos"),
        MaterialQuantity(name="Water", quantity=round(effective_area * 160 * type_factor, 0), unit="liters"),
    ]

    duration_weeks = max(10, min(52, int(6 + (input_data.floors * 4) + (effective_area / 450))))
    phase_weeks = _allocate_phase_weeks(duration_weeks)

    schedule: List[SchedulePhase] = []
    current_week = 1
    for idx, phase in enumerate(SCHEDULE_PHASES):
        end_week = current_week + phase_weeks[idx] - 1
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

    cost_breakdown = CostBreakdown(
        material_cost=round(material_cost, 2),
        labour_cost=round(labour_cost, 2),
        contractor_profit=round(contractor_profit, 2),
        gst_tax=round(gst_tax, 2),
        total_estimate=round(total_estimate, 2),
        cost_per_sqft=round(total_estimate / effective_area, 2),
    )

    suggestions = _build_suggestions(input_data, duration_weeks, cost_breakdown)

    return EstimateResult(
        project_area_sqft=round(effective_area, 2),
        duration_weeks=duration_weeks,
        cost_breakdown=cost_breakdown,
        materials=materials,
        detailed_materials=detailed_materials,
        schedule=schedule,
        tips=CONSTRUCTION_TIPS,
        suggestions=suggestions,
    )


def _upgrade_saved_project_if_legacy(project_doc: dict) -> SavedProject:
    try:
        return SavedProject(**project_doc)
    except ValidationError:
        input_data = EstimateInput(**project_doc["input_data"])
        refreshed_result = _calculate_estimate(input_data)
        upgraded_doc = {
            "id": project_doc.get("id", str(uuid.uuid4())),
            "project_name": project_doc.get("project_name", "Untitled Project"),
            "created_at": project_doc.get("created_at", datetime.now(timezone.utc).isoformat()),
            "input_data": input_data.model_dump(),
            "result": refreshed_result.model_dump(),
        }
        return SavedProject(**upgraded_doc)


@api_router.get("/")
async def root():
    return {"message": "AI Estimate Pro API is running"}


@api_router.post("/estimate", response_model=EstimateResult)
async def calculate_estimate(input_data: EstimateInput):
    return _calculate_estimate(input_data)


@api_router.post("/projects", response_model=SavedProject)
async def save_project(payload: SaveProjectRequest):
    result = _calculate_estimate(payload.input_data)
    project = SavedProject(
        id=str(uuid.uuid4()),
        project_name=payload.project_name,
        created_at=datetime.now(timezone.utc).isoformat(),
        input_data=payload.input_data,
        result=result,
    )
    project_doc = project.model_dump()
    await db.saved_projects.insert_one(project_doc)
    return project


@api_router.get("/projects", response_model=List[SavedProject])
async def list_projects(limit: int = 20):
    safe_limit = max(1, min(limit, 100))
    projects = await db.saved_projects.find({}, {"_id": 0}).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)
    normalized: List[SavedProject] = []
    for project in projects:
        normalized_project = _upgrade_saved_project_if_legacy(project)
        normalized.append(normalized_project)
    return normalized


@api_router.get("/projects/{project_id}", response_model=SavedProject)
async def get_project(project_id: str):
    project = await db.saved_projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _upgrade_saved_project_if_legacy(project)


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
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    await db.chat_messages.insert_one(user_record.model_dump())

    recent_records = (
        await db.chat_messages.find({"session_id": payload.session_id}, {"_id": 0})
        .sort("created_at", -1)
        .limit(12)
        .to_list(12)
    )
    recent_records.reverse()

    history_lines = [f"{item['role'].capitalize()}: {item['text']}" for item in recent_records]
    history_text = "\n".join(history_lines)
    context_block = payload.project_context or "No project context provided."
    final_prompt = (
        f"Project context:\n{context_block}\n\n"
        f"Recent conversation:\n{history_text}\n\n"
        f"Latest user message: {payload.message}"
    )

    chat = LlmChat(
        api_key=llm_key,
        session_id=payload.session_id,
        system_message=CHAT_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-5.2")

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
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    await db.chat_messages.insert_one(assistant_record.model_dump())

    return ChatMessageResponse(
        session_id=payload.session_id,
        reply=assistant_record.text,
        created_at=assistant_record.created_at,
    )


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()