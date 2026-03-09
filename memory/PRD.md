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
