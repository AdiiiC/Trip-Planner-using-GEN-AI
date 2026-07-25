# Wayfare (Trip Planner) — Frontend Redesign

## Original Problem Statement
Build a high-end, production-grade frontend for existing Trip Planner repo using React (Next.js 15), Tailwind CSS, and shadcn/ui, with strict anti-slop design constraints: deep zinc backgrounds, emerald accent, distinct fonts (Instrument Serif + Geist), asymmetric layouts, composed shadcn primitives, polished skeletons + light/dark mode.

## User choices
- **Framework**: Keep Next.js 15 (App Router)
- **Accent color**: Emerald
- **Fonts**: Instrument Serif (display) + Geist (body/mono)
- **Scope**: Full app redesign
- **Backend**: Wire to existing FastAPI, keys plugged in later

## Architecture
- Frontend: Next.js 16.2 / App Router, Tailwind v4, Radix + custom shadcn primitives, Framer Motion, TanStack Query
- Backend: FastAPI (`main.py` re-exported via `server.py`), LangGraph agents, Groq LLM. Missing API keys degrade gracefully (endpoints return `{"status":"degraded"}`).
- Supervisor: backend @ 8001, frontend @ 3000 (Next dev)

## What's been implemented (2026-01-25)
- New design token system in `globals.css`: emerald + zinc + Instrument Serif × Geist
- New Landing page (asymmetric grid, session stat card, workbench steps, CTA stripe)
- New Navbar with underline-active state, ⌘K palette, "More" dropdown
- New Footer with product/legal columns
- shadcn primitives added: `button`, `card`, `badge`, `input`, `label`, `tabs`, `tooltip`, `table`, `separator`, `dropdown-menu`
- Refined CommandPalette (⌘K) using new tokens
- Bulk color migration across tool pages (indigo → emerald, hardcoded hex → CSS vars)
- Refined ThemeToggle with animated sun/moon
- Fixed backend lint blockers (hotels.py `dt` shadow, main.py missing `search_cache` import)
- Backend .env stub, frontend .env with REACT_APP_BACKEND_URL

## Backlog / P1
- Provide GROQ_API_KEY / SERPER_API_KEY to unlock real itinerary streaming
- Deeper redesign of individual tool sub-components (BudgetCalculator, TripPlanner) to fully leverage shadcn Table/Tabs
- iCal export button surface & QR share polish
- Additional shadcn primitives (Popover, Sheet, Command)

## Test credentials
None (no auth in this app).

