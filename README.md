# TripMind — AI-Powered Trip Planner

A full-stack travel intelligence platform. Plan itineraries, calculate multi-destination budgets, predict cash to carry, look up attraction entry fees, track flight prices, find hotels & restaurants, check visa requirements, and explore sightseeing — all AI-powered, streamed live, and sourced from real web data.

**Live →** [tripplanner-sand.vercel.app](https://tripplanner-sand.vercel.app)

**Backend:** FastAPI · LangGraph · Groq Llama 3.3 70B · Exa (neural search) · Serper (Google Search)  
**Frontend:** Next.js 16 · TypeScript · Tailwind CSS v4 · Framer Motion · Radix UI

---

## ✨ Features

| Page | What it does |
|------|-------------|
| **Planner** `/planner` | Streaming AI itineraries · Multi-city trips · Packing lists · Visa info · Insurance estimate · Refine with feedback · Save / share / download · QR code share |
| **Budget** `/budget` | Multi-destination per-person budget · Live forex from orientexchange.in · Animated bar + pie charts · Cash conversion · Inline visa cost checker · **Attraction entry-fee auto-lookup** · **Cash-to-carry AI predictor** · Currency converter |
| **Sightseeing** `/sightseeing` | Top attractions with real entry prices · Nearby day trips ≤ 2 h · Category filters · Best-time-to-visit heatmap |
| **Flights** `/flights` | One-way prices · Check-in baggage filter · Sourced from Skyscanner.co.in |
| **Hotels** `/hotels` | Prices from Booking.com / MakeMyTrip / Agoda |
| **Restaurants** `/restaurants` | Top eats · Price ranges · Must-try dishes · Opening hours |
| **Visa Checker** `/visa` | Indian passport visa requirements · Colour-coded type badge · Cost auto-added to Budget |

### Planner modes
| Mode | Description |
|------|-------------|
| Itinerary | Time-blocked day plans with costs in local + preferred currency |
| Multi-city | Multiple city stops; inter-city transit section auto-generated |
| Packing list | Smart checklist by destination, climate, and activities |
| Visa info | Streaming markdown guide (Indian passport) |
| Insurance | Premium estimate with coverage recommendations |

### Budget page — highlights
- **Attraction entry-fee auto-lookup**: type an attraction name → click search → amount & currency auto-fill from live web data
- **Cash-to-carry predictor**: describe your spending plans per city in plain English (e.g. *"street food only, splitting Grab with 3 people, visiting Marble Mountains"*) → AI reads the notes and fetches real attraction entry fees from the Sightseeing agent to produce an accurate city-by-city cash estimate
- **Visa cost integration**: visa fees automatically suggested and addable to the budget extras
- **Live forex**: "Fill from Orient Exchange" button fetches current rates from orientexchange.in

### Additional UX features
- City autocomplete
- Wikipedia destination hero image
- Streaming progress bar
- Confetti on itinerary completion
- Dark / light theme toggle
- Mobile hamburger navigation (Android & Windows friendly)
- ⌘K / Ctrl+K command palette for instant navigation
- Aurora animated background
- `window.print()` export with print CSS
- PWA manifest (installable on mobile)
- Cookie consent + PostHog analytics (optional)
- Sentry error monitoring (frontend + backend)

---

## 🛠️ Tech Stack

### Backend (26 agents / 30 endpoints)

| Library | Purpose |
|---------|---------|
| FastAPI 0.115 | REST API + SSE streaming |
| LangChain + LangGraph | LLM orchestration |
| Groq (Llama 3.3 70B) | LLM inference — primary |
| OpenRouter | LLM fallback (auto-switch on Groq failure) |
| **Exa** | Neural semantic search — sightseeing, restaurants |
| **Serper.dev** | Google Search API — flights, hotels, visa, attraction prices |
| pydantic-settings | Typed, validated config from env vars |
| slowapi | Per-endpoint, per-IP rate limiting |
| tenacity | Retry with exponential backoff |
| Redis (optional) | Persistent search-result cache; falls back to in-memory TTL |
| Sentry SDK | Error monitoring |
| wttr.in | Weather forecast (no API key needed) |
| orientexchange.in | Live forex scraping (concurrent, 30-min cache) |
| Pydantic v2 | Input validation with field constraints |
| pytest + pytest-asyncio | 10+ unit + smoke tests |

### Frontend

| Library | Purpose |
|---------|---------|
| Next.js 16 (App Router) | React framework |
| TypeScript 5 | Type safety |
| Tailwind CSS v4 | Styling + design tokens |
| Framer Motion 12 | Animations, page transitions, spring physics |
| TanStack Query v5 | Data fetching + sessionStorage TTL cache |
| React Hook Form + Zod | Forms & validation |
| Recharts | Budget BarChart + PieChart |
| @dnd-kit | Drag-to-reorder multi-city stops |
| sonner | Toast notifications |
| qrcode.react | QR code share modal |
| next-themes | Dark / light theme |
| @sentry/nextjs | Frontend error monitoring |
| react-markdown + remark-gfm | Streaming markdown output |
| Radix UI | Accessible UI primitives |
| canvas-confetti | Itinerary completion celebration |

---

## 🔌 API Endpoints (30 total)

### Core
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check + service status |
| `GET` | `/api/forex` | Live forex rates (orientexchange.in → ExchangeRate-API fallback) |

### Planner
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/plan` | Stream AI itinerary (SSE) |
| `POST` | `/api/refine` | Stream itinerary refinement (SSE) |
| `POST` | `/api/packing` | Stream packing checklist (SSE) |
| `POST` | `/api/visa` | Stream visa guide markdown (SSE) |
| `POST` | `/api/insurance` | Stream insurance estimate (SSE) |
| `POST` | `/api/multi-city` | Stream multi-city itinerary (SSE) |

### Budget & Finance
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/budget` | Calculate per-person trip budget |
| `POST` | `/api/currency-convert` | Live currency conversion |
| `POST` | `/api/cash-predict` | AI cash-to-carry prediction (per city, with real entry fees) |
| `POST` | `/api/attraction-price` | Look up attraction entry fee from web |
| `POST` | `/api/extract-costs` | Parse cost line-items from an itinerary |

### Travel Discovery
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/flights` | Flight prices (Skyscanner.co.in via Serper) |
| `POST` | `/api/hotels` | Hotel prices (Booking.com / Agoda via Serper) |
| `POST` | `/api/restaurants` | Restaurant finder with price ranges |
| `POST` | `/api/sightseeing` | Top attractions + nearby day trips |
| `POST` | `/api/weather` | Weather forecast via wttr.in |
| `POST` | `/api/visa-check` | Structured visa requirements + cost |
| `POST` | `/api/best-time` | Month-by-month visit scores (cached) |
| `POST` | `/api/optimize-route` | Multi-city TSP route optimiser |
| `POST` | `/api/export/ics` | iCalendar (.ics) export |

Streaming endpoints use **Server-Sent Events** (`text/event-stream`).

---

## 📂 Project Structure

```
TripMind/
├── start.sh / start.bat / start.ps1   # one-command launchers (Mac/Win)
│
├── backend/
│   ├── config.py              # Pydantic Settings — single source of env config
│   ├── main.py                # FastAPI app · all middleware · all routes
│   ├── requirements.txt
│   ├── tests/
│   │   └── test_api.py        # 10+ pytest smoke + unit tests
│   └── agents/
│       ├── llm.py             # Centralised LLM factory + fallback chain
│       ├── cache.py           # Redis / in-memory TTL cache
│       ├── search.py          # Exa + Serper helpers with retry + cache
│       ├── budget.py          # Multi-destination budget calculator
│       ├── cash_predict.py    # AI cash-to-carry predictor (per city)
│       ├── attraction_price.py# Entry-fee lookup for named attractions
│       ├── currency.py        # Currency converter
│       ├── extract_costs.py   # Itinerary → budget autofill
│       ├── route.py           # TSP route optimiser (nearest-neighbour + 2-opt)
│       ├── best_time.py       # Month-by-month visit scores
│       ├── export.py          # iCalendar builder
│       ├── flights.py         # Flight price tracker
│       ├── hotels.py          # Hotel price finder
│       ├── insurance.py       # Insurance estimator (streaming)
│       ├── planner.py         # Itinerary · multi-city · packing · visa
│       ├── restaurants.py     # Restaurant finder
│       ├── sightseeing.py     # Attractions + nearby places
│       ├── visa_check.py      # Structured visa requirements
│       └── weather.py         # Weather forecast (wttr.in)
│
└── frontend/
    ├── app/
    │   ├── layout.tsx          # Root layout · Providers · Aurora · ⌘K palette
    │   ├── page.tsx            # Landing page
    │   ├── budget/             # Budget Calculator + Cash Predictor + Converter
    │   ├── flights/            # Flight tracker
    │   ├── hotels/             # Hotel finder
    │   ├── planner/            # Trip planner (all 5 modes)
    │   ├── restaurants/        # Restaurant finder
    │   ├── sightseeing/        # Sightseeing explorer + Best-time widget
    │   ├── visa/               # Visa checker
    │   ├── share/[id]/         # Shareable trip link (dynamic route)
    │   ├── privacy/ & terms/
    │   └── globals.css         # Design tokens · Aurora · Touch fixes
    ├── components/
    │   ├── Navbar.tsx          # Responsive (mobile hamburger + desktop nav)
    │   ├── CommandPalette.tsx  # ⌘K / Ctrl+K navigation
    │   ├── LandingPage.tsx
    │   ├── budget/BudgetCalculator.tsx
    │   ├── flights/FlightTracker.tsx
    │   ├── hotels/HotelFinder.tsx
    │   ├── planner/TripPlanner.tsx
    │   ├── restaurants/RestaurantFinder.tsx
    │   ├── sightseeing/SightseeingExplorer.tsx
    │   ├── visa/VisaCostChecker.tsx
    │   └── ui/
    │       ├── AuroraBackground.tsx
    │       ├── BestTimeWidget.tsx
    │       ├── CashPredictor.tsx
    │       ├── CountUp.tsx
    │       ├── CurrencyConverter.tsx
    │       └── (shadcn primitives)
    └── lib/
        ├── api.ts              # Typed API client (all 30 endpoints)
        ├── hooks.ts            # React Query hooks per endpoint
        ├── motion.ts           # Shared Framer Motion variants
        ├── tripHistory.ts      # localStorage history · share link · download
        ├── types.ts            # Shared TypeScript types
        └── utils.ts            # formatINR / formatUSD / cn
```

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| Groq API key | [console.groq.com](https://console.groq.com) — free |
| Serper API key | [serper.dev](https://serper.dev) — free tier |
| Exa API key | [exa.ai](https://exa.ai) — free tier |

### 1 — Clone & configure

```bash
git clone https://github.com/AdiiiC/Trip-Planner-using-GEN-AI.git
cd Trip-Planner-using-GEN-AI
cp backend/.env.example backend/.env
# Edit backend/.env:
#   GROQ_API_KEY=...
#   SERPER_API_KEY=...
#   EXA_API_KEY=...
#   OPENROUTER_API_KEY=...   (optional — fallback LLM)
#   REDIS_URL=...            (optional — persistent cache)
#   SENTRY_DSN_BACKEND=...   (optional — error monitoring)
```

### 2 — Run

**macOS / Linux:**
```bash
./start.sh
```

**Windows CMD:**
```cmd
start.bat
```

**Windows PowerShell:**
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # first time only
.\start.ps1
```

**Manual:**
```bash
# Terminal 1
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000

# Terminal 2
cd frontend
npm install
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API docs | http://localhost:8000/docs |

### 3 — Tests

```bash
cd backend
pytest tests/ -q
```

---

## 🌐 Hosting (Vercel + Render)

| Service | What to host |
|---------|-------------|
| **Vercel** (free) | Frontend — auto-deploys on every push to `main` |
| **Render** (free) | Backend — set Root Directory = `backend`, Start Command = `uvicorn main:app --host 0.0.0.0 --port $PORT` |

**Vercel env vars:** `NEXT_PUBLIC_API_URL=https://your-service.onrender.com`  
**Render env vars:** all keys from `backend/.env`

> Render free tier sleeps after 15 min idle (~30 s cold start). Use [UptimeRobot](https://uptimerobot.com) (free) to keep it awake.

---

## 💡 Notes

- Flight, hotel, and restaurant prices are **indicative** — sourced from web search snippets, not live booking APIs. Always verify before booking.
- Visa requirements are LLM + Serper sourced. **Always confirm with the official embassy.**
- Attraction entry fees are sourced from live web data where available; the LLM fills gaps from training knowledge.
- Cash-to-carry estimates are AI-generated based on your described spending plans + real sightseeing data.
- Weather uses [wttr.in](https://wttr.in) — no API key required.
- Forex uses [orientexchange.in](https://orientexchange.in) (scraped) → [exchangerate-api.com](https://exchangerate-api.com) fallback.
