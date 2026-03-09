# PRD — AI Estimate Pro

## Original Problem Statement
Build a simple, clean, responsive web app for construction estimate assistance (cost estimate, materials, schedule, charts, save projects, PDF/print, unit converter, tips) for students, homeowners, and small contractors.

## User Choices Captured
- Save project in database (no login)
- Use built-in India-average rates for MVP
- PDF should include full report with charts/tips context
- White UI; auto-pick readable palette
- Upgrade request: rename app to **AI Estimate Pro**, add detailed materials (very detailed but not super deep), add chatbot support, add more detailed schedule, and add smart improvements
- Chatbot choices: both app + construction help, OpenAI GPT-5.2, Emergent universal key

## Architecture Decisions
- **Frontend:** React + shadcn/ui + Recharts + jsPDF
- **Backend:** FastAPI + MongoDB (Motor)
- **AI Chat:** `emergentintegrations.llm.chat` using OpenAI GPT-5.2 via `EMERGENT_LLM_KEY`
- **Persistence:** MongoDB collections for saved projects and chat messages
- **Compatibility:** Added legacy project schema upgrade logic to avoid 500 errors with old saved data

## Implemented
- Multi-page responsive UI with top navigation: Home, Estimate, Materials, Schedule, About
- Rebranded app identity to **AI Estimate Pro**
- Estimate engine with India-default rates + location/floor/type adjustments
- Cost breakdown cards/table + pie chart
- Detailed material engine (30 line items) with category, quantity, unit, usage note
- Materials page with category summary cards + detailed BOQ-style table + chart
- Expanded schedule engine (8 phases) with tasks, milestones, expected crew size
- Schedule page includes timeline + detailed phase plan table + task cards
- Save/list/load projects (no login) with backward-compatible legacy data handling
- PDF download + print report
- Unit converter tool (feet↔meter, m³↔ft³)
- Construction tips + smart suggestions section
- AI chatbot (session creation, message, history persistence, contextual replies)
- Data-testid coverage across core interactive and key informational elements
- Regression tests added by testing agent: `/app/backend/tests/test_api_core.py` (passing)

## Prioritized Backlog
### P0
- Add markdown-safe rendering in chatbot replies for cleaner formatting
- Add material category filters/search for faster BOQ exploration

### P1
- Add phase-wise cash flow chart and procurement calendar
- Add CSV/Excel export for materials and schedule

### P2
- Add multi-project comparison dashboard
- Add location presets by city with periodically updateable rates

## Next Tasks
1. Improve chatbot response formatting and shorten output consistency.
2. Add material filters (category + keyword) and print-friendly material view.
3. Add phase-wise cost plan view (timeline + spend curve).
