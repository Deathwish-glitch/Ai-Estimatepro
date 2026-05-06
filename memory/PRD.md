# PRD — AI Estimate Pro (Extended Local Intelligence Release)

## Original Problem Statement
Extend existing construction estimation app (do not rebuild) with local market intelligence for Nashik + nearby areas, supplier updates, WhatsApp rate ingestion, smarter optimized estimates, contractor comparison, speed-optimized schedule, trend tracking, professional reports, and updated navigation.

## User Choices Captured
- Website ingestion: **full auto-scrape best effort**
- Contractor comparison: **manual input + auto baseline fallback**
- Refresh cycle: **user-selectable (daily/weekly)**
- WhatsApp free option: implemented **Meta Cloud API webhook-style integration path** (free-start friendly)
- Drawing Analyzer AI model: **OpenAI GPT-5.2** with **Emergent universal key**
- Drawing quantity behavior: **Hybrid mode** (strict structural + assisted finishing)
- Drawing manual comparison: **manual entry + fallback baseline**

## Architecture Decisions
- **Frontend:** React + shadcn/ui + Recharts/jsPDF (fixed-size chart rendering for stability)
- **Backend:** FastAPI + MongoDB (Motor)
- **AI Chat:** OpenAI GPT-5.2 via `EMERGENT_LLM_KEY`
- **Drawing Vision Analysis:** OpenAI GPT-5.2 vision with uploaded image/PDF conversion pipeline (PDF first-page rasterization via PyMuPDF)
- **Market Intelligence Data:**
  - `market_rate_sources` (manual/supplier/website/government/whatsapp entries)
  - `market_rate_history` (trend points)
  - `market_rate_snapshots` (aggregated snapshots)
  - `supplier_rates` (portal + WhatsApp updates)
  - `app_settings` (refresh frequency)
- **Compatibility:** Legacy saved project upgrade path retained to prevent schema break

## Implemented
- New navigation: **Home, Estimate, Drawing Analyzer, BOQ, Local Market Rates, Suppliers, Reports**
- Local Market Rates module:
  - daily/weekly settings
  - aggregated average local rates table (material, avg rate, source count, cheapest supplier)
  - manual source ingestion endpoint + UI form
  - URL scrape endpoint (best-effort extraction for Cement/Steel/Sand/Brick)
  - material price trend endpoint + chart
- Supplier dashboard:
  - supplier form (name, location, cement/steel/sand/brick)
  - supplier update listing table
- WhatsApp support:
  - `/api/whatsapp/webhook` verify + receive endpoints
  - structured message parsing (`RATE UPDATE ...`) into supplier/material databases
- Smart estimate optimization:
  - uses local market rates in estimate computation
  - material/labour optimization factors
  - recommended cheaper suppliers in response
- Contractor comparison:
  - table rows for contractor vs AI estimate vs savings
  - supports manual contractor values + fallback baseline
- Construction speed optimization:
  - optimized schedule stages with parallel-work indicators
- Report enhancements:
  - reports page with comparison chart/table and optimized timeline
  - PDF now includes local rate analysis, comparison, and optimized schedule tables
- BOQ enhancements:
  - detailed itemized BOQ remains with category summary
- Drawing Analyzer module:
  - Upload support: PNG/JPG/PDF
  - AI drawing interpretation for walls, rooms, columns, doors, windows, staircases, slabs
  - Dimension/room-label/wall-thickness extraction with structured JSON parsing
  - Automatic BOQ table: wall area, concrete, brickwork, brick quantity, steel, plaster, flooring
  - Cost estimation using local market rates (cement/steel/sand/brick) + labour
  - Smart warning panel for missing dimensions / thickness irregularity / structural inconsistency
  - Optimized schedule generator with parallel-stage markers
  - Manual vs AI quantity comparison + time comparison table
  - Professional downloadable Drawing Analyzer report (PDF)
  - Market rates used table added in UI for transparency
  - BOQ confidence scoring added (high/medium/low + score)
  - Calibration step added (reference length input and scale application logic/fallback notes)
  - Drawing analysis history endpoint + UI history table
  - Version compare endpoint + UI (cost delta, duration delta, BOQ deltas)
- QA fixes from testing:
  - stable BOQ page-level `data-testid` in both populated and empty states
  - removed chart mount warnings by switching to fixed-size chart rendering
  - drawing analyzer market-rate visibility gap closed after testing feedback

## Prioritized Backlog
### P0
- Add Nashik area-wise micro-zones (Nashik city / Satpur / Gangapur / nearby talukas) for tighter rate filtering
- Add supplier trust score (freshness + variance + consistency)
- Add persisted drawing analysis history page with reopen/export actions

### P1
- Add periodic background scraper jobs for approved source lists
- Add downloadable Excel BOQ + trend appendix for presentation workflow

### P2
- Add negotiation assistant suggestions (purchase timing + batch split)
- Add multi-project benchmark dashboard

## Next Tasks
1. Introduce zone-based local rate filtering and confidence score per material.
2. Add source quality controls (outlier removal + weighted average by recency/reliability).
3. Add multi-page engineering PDF with embedded drawing snapshot and chart pages.
4. Add persistent compare presets (A/B/C) and shareable comparison links.

---

## Latest Phase Update — Professional QS + BOQ Workflow (Current Iteration)

### New User Direction Captured
- Build a **professional civil quantity surveying workflow** (not a simple calculator)
- Execute in current app first, but keep architecture migration-ready for Next.js + TypeScript + Supabase/Postgres
- Phase-1 priority order:
  1. Quantity calculation engine
  2. Dynamic editable measurement system
  3. Formula dependency recalculation
  4. BOQ generation
  5. Excel/PDF exports
  6. Deductions/additions engine
- Drawing scope for phase-1: PDF/image/manual + DWG upload metadata (no full DWG parsing yet)

### New Architecture Additions
- Frontend state management via **Zustand** (`/app/frontend/src/store/qsStore.js`)
- Formula and quantity engine module (`/app/frontend/src/utils/qsFormulaEngine.js`)
- New backend QS APIs under `/api/qs/*` for projects, versions, measurement items, BOQ items, rates, export logs
- Supabase migration-ready relational SQL scaffold added at `/app/backend/supabase_schema.sql`

### Newly Implemented (This Iteration)
- `/estimate` upgraded into **Professional QS + BOQ Estimation Studio**
- Project dashboard with project metadata, drawing attachment metadata, revision creation, revision selection
- Dynamic measurement sheets with:
  - inline editable rows
  - category formulas
  - additions/deductions/wastage/rate controls
  - live recalculation of quantity + amount
  - duplicate/remove row actions
  - undo/redo snapshots
- BOQ generator:
  - regenerate from measurements
  - manual BOQ line editing
  - save/load via backend
- Editable material/labour rate database by city
- Rough estimate mode (Basic/Standard/Premium/Luxury)
- Export system:
  - ExcelJS multi-sheet export (Summary, BOQ, Detailed Measurement, RCC, Steel BBS, Paint, Rate Analysis, Material Summary, Abstract Cost)
  - professional PDF export with project + measurement + BOQ tables + signatures
  - export logs persisted
- Backend test coverage expanded by testing agent for QS workflows

### Updated Backlog Priority
#### P0
- Add formula dependency graph UI (show linked cells/rows and recalculation chain)
- Add row-level copy/paste and keyboard navigation for spreadsheet-like experience
- Add project metadata update endpoint (currently create/load oriented)

#### P1
- Introduce Supabase Auth and dual repository mode (Mongo runtime + Supabase switch)
- Add version restore and side-by-side revision diff for measurements/BOQ

#### P2
- Add AI-assisted takeoff suggestions on top of manual measurement workflow
- Add DWG parser service placeholders (`drawingParserService`, `geometryEngine`, `OCRService`) with queue design

---

## Latest Phase Update — Semi-Automatic Estimation Engine + Weather Tab

### User Direction Captured
- Auto-generate professional estimate from basic inputs (project/client/location/built-up area/floors/type/quality + optional room counts)
- Keep all generated values fully editable (quantity/rate/formula/additions/deductions)
- Use uploaded Excel samples as structure inspiration but modernize with cleaner professional exports
- Add separate India weather forecast tab using OpenWeather architecture with graceful missing-key fallback

### Newly Implemented
- Added semi-automatic generation logic (`/app/frontend/src/utils/qsAutoGenerator.js`) using engineering ratios and quality multipliers
- One-click generation now creates editable rows across major construction heads (Excavation, PCC, RCC, Brickwork, Plaster, Flooring, Paint, Waterproofing, Steel/BBS, Plumbing, Electrical, Finishing, etc.)
- Added editable assumptions panel and optional room-count inputs to influence generated takeoff
- Auto-generated day/week construction schedule tab integrated with generated estimate
- Added modular weather stack:
  - `weatherProviderAdapter`
  - `forecastFormatter`
  - `weatherService`
  - backend `/api/weather/forecast` endpoint with OpenWeather integration and graceful fallback when `OPENWEATHER_API_KEY` is blank
- Export templates modernized with professional multi-sheet naming and section headers inspired by provided files

### Validation Status
- Testing agent run completed for new flow (`iteration_6`) with backend + frontend pass
- No critical/minor runtime defects found in scoped features

### Updated Next Tasks
1. Add sheet-level keyboard navigation and copy/paste fill-down interactions for true spreadsheet UX.
2. Split large frontend/backend files into modular components/routers for maintainability.
3. Add optional assumption presets by building archetype (villa/apartment/G+1/commercial shell).

---

## Latest Phase Update — Tender-Format Abstract & BOQ Template + Preset Profiles (Current Iteration — Feb 2026)

### User Direction Captured
- "Use this templates exactly for abstract measurement sheet and BOQ" — based on the Sample BOQ - Commercial Building (Bengaluru) PDF supplied by user.
- Add details (NOTES per section, floor-wise breakdown, basic rates) and complete the rest of the upcoming P1 tasks.
- Do not exhaust too many tokens — implement core asks, lean.

### Newly Implemented
- Created `/app/frontend/src/utils/qsAbstractTemplate.js`:
  - Exports: `ABSTRACT_SECTIONS` (A-J), `ABSTRACT_ADDENDUM_SECTIONS` (K-N for MEP/Doors/Finishing), `BASIC_RATES` (14 standard items per template), `SECTION_NOTES` (per-section tender notes), `PROJECT_PRESETS` (Villa, G+1 House, Apartment, Commercial), `buildAbstract`, `buildDetailedBoqBySection`, floor-wise splitter.
- Updated `QSEstimatorPage.jsx`:
  - **NEW Excel export structure** (sheets in this exact order): PROJECT INFO → SUMMARY - Main Building (A-J + addendum + TOTAL) → BASIC RATES → DETAILED BOQ (each section has 'A' header + NOTE block + table + Sub-Total + Grand Total) → MEASUREMENT SHEET → MANUAL VS AI → EXECUTION SCHEDULE → RATE ANALYSIS.
  - **NEW PDF export structure**: Title block → SUMMARY (page 1) → BASIC RATES (page 2) → one page per section (A-N) with NOTE block + items + sub-total → Manual vs AI → Schedule → Grand Total + signatures.
  - **NEW in-app tab "Abstract & BOQ Template"** (testid `qs-tab-abstract`): live preview of SUMMARY, BASIC RATES table, and section-wise detailed BOQ with NOTES, floor-wise rows, sub-totals.
  - **NEW preset selector** (testid `qs-preset-select-trigger`): one-click apply Villa/G+1/Apartment/Commercial preset that updates floors, rate_profile, room counts and engineering assumptions.
- Floor-wise breakdown: when project floors > 1, RCC/Columns/Beams/Slabs/Brickwork/Blockwork/Plaster/Flooring/Paint/Waterproofing automatically split across "Ground floor → Seventh floor" labels in both UI and exports.

### Validation Status
- Testing agent run completed: `iteration_9.json` — backend 100% (10/10 pytest) and frontend 100% (15/15 Playwright steps including Villa preset, all A-N sections, 14 basic rate rows, Excel + PDF export triggers).

### Updated Next Tasks
1. (Carry-over) Spreadsheet keyboard mode — arrow-key navigation, copy/paste, fill-down for measurement sheet.
2. (Carry-over) Refactor oversized files: split `QSEstimatorPage.jsx` (~1667 lines) into `MeasurementSheet`, `AbstractTab`, `BoqGenerator`, `Exports` sub-components; split `server.py` into modular routers/services.
3. (Carry-over) Migrate sensitive items from localStorage to HttpOnly cookies / secure backend session.
4. Make `BASIC_RATES` editable per-project (currently template defaults; wire to project state).
5. Add weighted floor-wise distribution (ground/upper/terrace ratios) instead of even split.

---

## Latest Phase Update — Schedule Redesign + Better Rates + Weather UX + Export Hardening (Feb 2026)

### User Direction Captured (4 issues reported)
1. Weather forecast key not set — forecast not working.
2. Export PDF/Excel not downloading in template format.
3. Schedule UI looks bad — make it better and more visual.
4. Better default rate data needed.

### Newly Implemented
- **Weather**: backend `/api/weather/forecast` now accepts an `api_key` query param so users can supply their own OpenWeatherMap key (no env change needed). Frontend Weather tab shows a password-style API key input (`qs-weather-api-key-input`) saved to `localStorage` (`ai_estimate_pro_owm_key`) and a help link to openweathermap.org/api. Without a key, graceful placeholder fallback message updated.
- **Exports**: Both `createExcelExport` and `createPdfExport` now wrapped in try/catch with clear toast.error on failure and validation toast when `measurements.length === 0`. Successful export shows toast.success.
- **Schedule tab redesign** (`qs-tab-schedule`) — full Gantt-style timeline:
  - 4-card KPI strip (Total Duration / Weeks / Months / Phases).
  - Project window: Start date → handover date with gradient progress bar.
  - Phase Timeline (Gantt) with color-coded horizontal bars per phase (6-color palette), each bar showing duration + week range.
  - Color-coded phase cards (one per phase) with start/end day/week.
  - Collapsible "View as table" details for legacy table view.
- **Better default rates** (Feb 2026 Indian market):
  - Material rates expanded from 7 -> 22 entries (Cement OPC 53/PPC, TMT Steel Fe-500/Fe-550D, M-Sand, AAC Block, RMC M25/M30 etc.).
  - Labour rates expanded from 5 -> 12 entries (Mason Skilled/Helper, Plumber, Electrician, Tile Mason, Site Supervisor etc.).
  - `loadRates` now non-destructively merges backend rates with new defaults — backend rates win by name, missing defaults are appended.

### Validation Status
- Self-tested via Playwright smoke (7/7 pass): export validation toast, Schedule rendering with 5 Gantt bars + 5 phase cards, weather API key field + localStorage persistence, Excel + PDF download, merged rate database (23 material + 13 labour entries).
- Backend curl: `/api/weather/forecast?api_key=XYZ` correctly accepts override; invalid key returns 401 with friendly fallback.
