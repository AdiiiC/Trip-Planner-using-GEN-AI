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


## Test iteration log
- iter-1 (2026-01-25): SSR ok; hydration blocked by (a) narrow allowedDevOrigins, (b) unguarded Sentry init, (c) mounted-gated ThemeToggle. Frontend 60%.
- iter-2 (2026-01-25): Fixed all three above. Frontend 100%. ThemeToggle switches data-theme, More dropdown shows 4 items, ⌘K opens palette, filter+Enter+ESC all work. Retest not needed.

## Deferred items (P2)
- Replace native `<input type="date">` in HotelFinder with shadcn Calendar + Popover
- Deeper design pass on TripPlanner form controls (mode selector, quick examples)
- Silence dev-only CSP cloudflare beacon block + font preload warnings

## Follow-up iteration 3 (2026-01-25)
### Delivered
- **Real Groq + Serper wired**: /api/health now groq:true, serper:true. /api/plan streams live SSE content in <1s first chunk. Real Kyoto itineraries streaming end-to-end.
- **/api/city-photo endpoint**: Wikipedia REST summary lookup with country disambiguation + Unsplash Source fallback; 24h in-memory cache. Kyoto lookup completes in ~130ms.
- **CityHero component**: editorial banner with soft gradient overlay, Instrument Serif city title, "VIA WIKIPEDIA" attribution chip; used on /sightseeing and /planner (replaces old useWikiHero mini-hero on planner).
- **shadcn Calendar + Popover + DateRangePicker**: react-day-picker v10 fully themed with emerald + zinc; two-month view, disabled past dates, emerald range fill, nights badge, clear button. Native <input type='date'> removed from /hotels.
- HotelFinder rewritten from scratch using shadcn primitives (Button, Input, Label, Badge, DateRangePicker, CityHero).

### Test result
- Backend: 12/12 pytest (iter3_all.xml)
- Frontend: 100% acceptance criteria across 8 routes, 0 pageerrors

## Follow-up iteration 4 (2026-01-25)
### Delivered
- **Weather + Season chips on CityHero**: top-right overlay shows live temperature + short description (via /api/weather → wttr.in) and a season chip tier (Peak/Great/Shoulder/Low) with the three best months (via /api/best-time → Groq LLM); both silent-fail; sessionStorage cached (10 min); works on /sightseeing and /planner heroes.
- Kyoto returned 29° Clear · Shoulder season · BEST: NOV, OCT, APR. Barcelona: 30° Partly cloudy · Peak season now · BEST: JUN, MAY, SEP.
- Fixed dynamic-class Tailwind JIT concern by moving to static class literals per tier.

### Test result (iter-4)
- Frontend: 100% (all acceptance criteria across /sightseeing, /planner, /hotels, mobile 375px). No JS errors from CityHero.
