# TripMind — AI-Powered Trip Planner

A full-stack travel intelligence platform. Plan itineraries, calculate multi-destination budgets, track flight prices, find hotels & restaurants, check visa requirements, and explore sightseeing — all AI-powered and streamed live.

**Live →** [tripplanner-sand.vercel.app](https://tripplanner-sand.vercel.app)

**Backend:** FastAPI · LangChain · Groq Llama 3.3 70B · Serper (Google Search) · Exa (neural search)  
**Frontend:** Next.js 16 · TypeScript · Tailwind CSS v4 · Framer Motion · Radix UI

---

## ✨ Features

| Page | What it does |
|------|-------------|
| **Planner** `/planner` | Streaming AI itineraries · Multi-city trips · Packing lists · Visa info · Insurance estimate · Refine with feedback · Save/share/download · Per-day copy · QR code share |
| **Budget** `/budget` | Multi-destination per-person budget · Live forex rates · Animated BarChart + PieChart breakdown · Cash conversion · Inline visa cost checker |
| **Sightseeing** `/sightseeing` | Top attractions with real entry prices · Nearby day trips ≤ 2 h · Category filters · Live-scraped via Google + Exa |
| **Flights** `/flights` | One-way prices · Check-in baggage filter · Sourced from Skyscanner.co.in · Airline logos |
| **Hotels** `/hotels` | Prices from Booking.com / MakeMyTrip / Agoda · 5-star display |
| **Restaurants** `/restaurants` | Top eats · Price ranges · Must-try dishes · Visual star ratings |
| **Visa Checker** `/visa` | Indian passport visa requirements · Type badge · Cost auto-added to Budget |

### Planner modes
- **Itinerary** — time-blocked day plans with costs in local + preferred currency, collapsible day sections
- **Multi-city** — drag-to-reorder stops, inter-city transit section
- **Packing list** — smart checklist based on destination, climate, and activities
- **Visa info** — streaming markdown guide for Indian passport holders
- **Insurance** — premium estimate with coverage recommendations

### UX features
- City autocomplete (GeoDB via backend proxy — key never exposed to browser)
- Recently searched city chips
- Wikipedia destination hero image
- Streaming progress bar per day
- Confetti on itinerary completion
- Dark / light theme toggle
- Mobile hamburger navigation
- Keyboard shortcut: `Cmd/Ctrl + Enter` submits any form
- `window.print()` export with clean print CSS
- PWA manifest (installable on mobile)

---

## 🛠️ Tech Stack

### Backend
| Library | Purpose |
|---------|---------|
| FastAPI 0.115 | REST API + SSE streaming |
| LangChain + LangGraph | LLM orchestration |
| Groq (Llama 3.3 70B) | LLM inference (fast, free tier) |
| **Serper.dev** | Google Search API — flights, hotels, visa, prices |
| **Exa** | Neural semantic search — restaurants, sightseeing |
| slowapi | Rate limiting (per-endpoint, per-IP) |
| tenacity | Retry with exponential backoff on search failures |
| Redis (optional) | Persistent search result cache (falls back to in-memory TTL) |
| Sentry SDK | Error monitoring |
| wttr.in | Weather forecast (no API key) |
| Pydantic v2 | Input validation with field constraints |

### Frontend
| Library | Purpose |
|---------|---------|
| Next.js 16 (App Router) | React framework |
| TypeScript 5 | Type safety |
| Tailwind CSS v4 | Styling |
| Framer Motion 12 | Animations + page transitions |
| TanStack Query v5 | Data fetching + sessionStorage TTL cache |
| React Hook Form + Zod | Forms & validation |
| Recharts | Budget BarChart + PieChart |
| @dnd-kit | Drag-to-reorder multi-city stops |
| sonner | Toast notifications |
| qrcode.react | QR code share modal |
| next-themes | Dark/light theme |
| @sentry/nextjs | Frontend error monitoring |
| react-markdown | Streaming markdown output |
| Radix UI | Accessible UI primitives (Tooltip, Dialog, etc.) |

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| Groq API key | [console.groq.com](https://console.groq.com) — free |
| Serper API key | [serper.dev](https://serper.dev) — 2,500 free searches/month |
| Exa API key | [exa.ai](https://exa.ai) — $10 free credit |
| RapidAPI key | [rapidapi.com](https://rapidapi.com/wirefreethought/api/geodb-cities) — 1,000 req/day free (optional, falls back to Photon) |

### 1 — Clone

```bash
git clone https://github.com/AdiiiC/Trip-Planner-using-GEN-AI.git
cd Trip-Planner-using-GEN-AI
```

### 2 — Configure environment

**Backend** (`backend/.env`):
```env
GROQ_API_KEY=your_groq_key
SERPER_API_KEY=your_serper_key
EXA_API_KEY=your_exa_key
RAPIDAPI_KEY=your_rapidapi_key        # optional — city autocomplete
REDIS_URL=redis://...                  # optional — persistent cache (Upstash free tier)
SENTRY_DSN_BACKEND=https://...         # optional — error monitoring
```

**Frontend** (`frontend/.env.local`):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3 — Run

**macOS / Linux:**
```bash
./start.sh
```

**Manual:**

Terminal 1 — Backend:
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Terminal 2 — Frontend:
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** · API docs → **http://localhost:8000/docs**

---

## 📂 Project Structure

```
Trip-Planner-using-GEN-AI/
├── .github/workflows/ci.yml   # GitHub Actions: Python syntax + TS check + build
├── start.sh / start.bat / start.ps1
│
├── backend/
│   ├── main.py                # FastAPI app · all endpoints · rate limiting · CORS
│   ├── requirements.txt
│   └── agents/
│       ├── budget.py          # Multi-destination per-person budget calculator
│       ├── cache.py           # TTL cache (Redis-backed or in-memory fallback)
│       ├── flights.py         # Flight price tracker (Skyscanner via Serper)
│       ├── hotels.py          # Hotel finder (Booking.com / Agoda via Serper)
│       ├── insurance.py       # Travel insurance estimator (streaming)
│       ├── planner.py         # Itinerary · Multi-city · Packing · Visa (streaming)
│       ├── restaurants.py     # Restaurant finder (Exa neural search)
│       ├── search.py          # Unified search helpers: serper_search + exa_search
│       ├── sightseeing.py     # Attractions + entry prices (Serper + Exa concurrent)
│       ├── visa_check.py      # Visa requirements + cost (Indian passport)
│       └── weather.py         # Weather forecast (wttr.in, no key needed)
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx         # Root layout: ErrorBoundary · PageTransition · Toaster
│   │   ├── page.tsx           # Landing page
│   │   ├── opengraph-image.tsx # Dynamic OG image (1200×630)
│   │   ├── privacy/           # Privacy Policy
│   │   ├── terms/             # Terms of Service
│   │   ├── budget/ flights/ hotels/ planner/ restaurants/ sightseeing/ visa/
│   ├── components/
│   │   ├── planner/TripPlanner.tsx    # Main planner: itinerary + all modes
│   │   ├── budget/BudgetCalculator.tsx
│   │   ├── flights/FlightTracker.tsx
│   │   ├── hotels/HotelFinder.tsx
│   │   ├── restaurants/RestaurantFinder.tsx
│   │   ├── sightseeing/SightseeingExplorer.tsx
│   │   ├── visa/VisaCostChecker.tsx
│   │   ├── ui/
│   │   │   ├── CityAutocomplete.tsx  # GeoDB proxy via backend
│   │   │   ├── Skeleton.tsx          # Shimmer skeleton loaders
│   │   │   ├── BackToTop.tsx         # Scroll-aware back-to-top button
│   │   │   ├── QRCodeButton.tsx      # QR code share modal
│   │   │   └── ThemeToggle.tsx       # Dark/light toggle
│   │   ├── ErrorBoundary.tsx         # React error boundary + Sentry
│   │   ├── CookieConsent.tsx         # GDPR consent banner
│   │   ├── LandingPage.tsx
│   │   ├── Navbar.tsx                # Desktop + mobile nav + theme toggle
│   │   └── PageTransition.tsx        # Framer Motion route transitions
│   ├── lib/
│   │   ├── api.ts             # Typed API client + sessionStorage TTL cache
│   │   ├── types.ts           # Shared TypeScript types
│   │   ├── utils.ts           # formatINR / formatUSD / cn
│   │   └── tripHistory.ts     # localStorage history · share URL · download .md
│   ├── public/manifest.json   # PWA manifest
│   └── instrumentation.ts     # Sentry Next.js instrumentation
```

---

## 🔌 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/health` | Health check + API key status |
| `GET`  | `/api/forex` | Live forex rates (base INR) |
| `GET`  | `/api/cities` | City autocomplete proxy (GeoDB / Photon fallback) |
| `POST` | `/api/budget` | Calculate per-person trip budget |
| `POST` | `/api/plan` | Stream AI itinerary (SSE) |
| `POST` | `/api/refine` | Stream itinerary refinement (SSE) |
| `POST` | `/api/packing` | Stream packing list (SSE) |
| `POST` | `/api/visa` | Stream visa guide markdown (SSE) |
| `POST` | `/api/multi-city` | Stream multi-city itinerary (SSE) |
| `POST` | `/api/insurance` | Stream insurance estimate (SSE) |
| `POST` | `/api/flights` | Search flight prices |
| `POST` | `/api/hotels` | Search hotel prices |
| `POST` | `/api/restaurants` | Find restaurants |
| `POST` | `/api/sightseeing` | Get attractions + entry prices |
| `POST` | `/api/weather` | Weather forecast |
| `POST` | `/api/visa-check` | Structured visa requirements + cost |

Streaming endpoints (`/api/plan`, `/api/refine`, etc.) use **Server-Sent Events** (`text/event-stream`).

---

## 🔒 Security

- Rate limiting on every endpoint (slowapi, per-IP)
- Input length + type validation on all Pydantic models
- API keys server-side only — never sent to browser
- CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy headers
- Error responses never leak stack traces (production mode)
- Sentry error monitoring (backend + frontend)
- GDPR-aware privacy policy, terms of service, cookie consent

---

## 🌐 Deployment

| Service | What it hosts |
|---------|--------------|
| **Vercel** | Next.js frontend (auto-deploys on push to `main`) |
| **Render** | FastAPI backend (auto-deploys on push to `main`) |

**Render environment variables required:**
`GROQ_API_KEY`, `SERPER_API_KEY`, `EXA_API_KEY`, `RAPIDAPI_KEY`, `SENTRY_DSN_BACKEND`

**Vercel environment variables required:**
`NEXT_PUBLIC_API_URL` (your Render backend URL), `SENTRY_AUTH_TOKEN`

---

## 💡 Notes

- Flight, hotel, and restaurant prices are **indicative estimates** sourced from Google Search via Serper + Exa. Always verify on the booking platform before purchasing.
- Visa requirements are AI-generated + Google Search verified. **Always confirm with the official embassy before travel.**
- Sightseeing entry prices sourced from TripAdvisor, GetYourGuide, and LonelyPlanet via Google Search.
- Weather uses [wttr.in](https://wttr.in) — no API key required.
- Forex uses orientexchange.in (scraping) with exchangerate-api.com as fallback — no key required.


---

## ✨ Features

| Page | What it does |
|------|-------------|
| **Planner** `/planner` | Streaming AI itineraries · Multi-city trips · Packing lists · Visa info · Insurance estimator · Refine with feedback · Save history · Share link · Download as `.md` |
| **Budget Calculator** `/budget` | Multi-destination per-person budget · Live forex rates · Flight/stay/sightseeing breakdown · Cash conversion · Pie chart · Inline visa cost checker |
| **Sightseeing** `/sightseeing` | Top attractions with entry fees · Nearby day trips ≤ 2 h · Category filters · Web-scraped |
| **Flights** `/flights` | One-way prices · **Check-in baggage filter ON** · Sourced from Skyscanner.co.in via Tavily |
| **Hotels** `/hotels` | Price suggestions from Booking.com / MakeMyTrip / Agoda |
| **Restaurants** `/restaurants` | Top eats with price ranges · Must-try dishes · Budget tier filters |
| **Visa Checker** `/visa` | Indian passport visa requirements for any country · Type badge (Free / e-Visa / VoA / Consulate) · Cost auto-added to Budget |

### Planner modes
- **Itinerary** — day-by-day, time-blocked, costs in local currency + your preferred currency
- **Multi-city** — plan stops across multiple cities with inter-city transit section
- **Packing list** — smart checklist based on destination, climate, and activities
- **Visa info** — markdown guide for Indian passport holders (streaming)
- **Insurance** — premium estimate with coverage recommendations (streaming)

### Visa checker — colour-coded types
| 🟢 | Visa Free | No action needed |
| 🟢 | Arrival Card Required | Fill digital card (e.g. Thailand TDAC — 3 days before) |
| 🔵 | e-Visa | Apply & pay online before travel (e.g. Vietnam $25) |
| 🟡 | Visa on Arrival | Pay at airport/port (e.g. Indonesia, Cambodia) |
| 🔴 | Consulate | Apply at embassy (e.g. USA $185, UK, Schengen) |

---

## 🛠️ Tech Stack

### Backend
| Library | Purpose |
|---------|---------|
| FastAPI | REST API + Server-Sent Events (streaming) |
| LangChain / LangGraph | LLM orchestration & agent workflows |
| Groq (Llama 3.3 70B) | LLM inference |
| Tavily | Web search for flights, hotels, sightseeing, visa |
| wttr.in | Weather forecast (no API key needed) |
| ExchangeRate-API | Live forex rates (free, no key needed) |
| Pydantic v2 | Request/response validation |

### Frontend
| Library | Purpose |
|---------|---------|
| Next.js 15 (App Router) | React framework |
| TypeScript 5 | Type safety |
| Tailwind CSS v4 | Styling |
| Framer Motion | Animations |
| TanStack Query v5 | Data fetching & caching |
| React Hook Form + Zod | Forms & validation |
| Recharts | Budget pie chart |
| react-markdown | Streaming markdown output |
| Zustand | State management |

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| Groq API key | [console.groq.com](https://console.groq.com) — free |
| Tavily API key | [tavily.com](https://tavily.com) — free tier available (optional; falls back to LLM knowledge) |

### 1 — Clone

```bash
git clone https://github.com/yourusername/tripmind.git
cd tripmind
```

### 2 — Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set:
#   GROQ_API_KEY=your_groq_key
#   TAVILY_API_KEY=your_tavily_key   # optional
```

### 3 — Run

**macOS / Linux:**
```bash
./start.sh
```

**Windows (double-click or CMD):**
```cmd
start.bat
```

**Windows (PowerShell):**
```powershell
# First time only:
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# Then:
.\start.ps1
```

**Manual (any OS):**

Terminal 1 — Backend:
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

Terminal 2 — Frontend:
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

API interactive docs → **http://localhost:8000/docs**

---

## 📂 Project Structure

```
Trip-Planner-using-GEN-AI/
├── start.sh                  # macOS/Linux launcher
├── start.bat                 # Windows CMD launcher
├── start.ps1                 # Windows PowerShell launcher
│
├── backend/
│   ├── main.py               # FastAPI app + all endpoints
│   ├── requirements.txt
│   ├── .env.example
│   └── agents/
│       ├── budget.py         # Multi-destination budget calculator
│       ├── flights.py        # Skyscanner.co.in flight price tracker
│       ├── hotels.py         # Hotel price finder
│       ├── insurance.py      # Travel insurance estimator (streaming)
│       ├── planner.py        # Itinerary · Multi-city · Packing · Visa (streaming)
│       ├── restaurants.py    # Restaurant finder
│       ├── sightseeing.py    # Attractions + nearby places
│       ├── visa_check.py     # Visa cost checker (Indian passport)
│       └── weather.py        # Weather forecast (wttr.in)
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # Landing page
│   │   ├── budget/           # Budget calculator
│   │   ├── flights/          # Flight tracker
│   │   ├── hotels/           # Hotel finder
│   │   ├── planner/          # AI trip planner
│   │   ├── restaurants/      # Restaurant finder
│   │   ├── sightseeing/      # Sightseeing explorer
│   │   └── visa/             # Visa cost checker
│   ├── components/
│   │   ├── budget/BudgetCalculator.tsx
│   │   ├── flights/FlightTracker.tsx
│   │   ├── hotels/HotelFinder.tsx
│   │   ├── planner/TripPlanner.tsx
│   │   ├── restaurants/RestaurantFinder.tsx
│   │   ├── sightseeing/SightseeingExplorer.tsx
│   │   ├── visa/VisaCostChecker.tsx
│   │   ├── LandingPage.tsx
│   │   └── Navbar.tsx
│   └── lib/
│       ├── api.ts            # Typed API client
│       ├── types.ts          # Shared TypeScript types
│       ├── utils.ts          # formatINR / formatUSD / cn
│       └── tripHistory.ts    # localStorage history · share link · download
│
└── Trip Planner using GEN AI.ipynb   # Original prototype notebook
```

---

## 🔌 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/forex` | Live forex rates (base INR) |
| `POST` | `/api/budget` | Calculate per-person trip budget |
| `POST` | `/api/plan` | Stream AI itinerary |
| `POST` | `/api/refine` | Stream itinerary refinement |
| `POST` | `/api/packing` | Stream packing list |
| `POST` | `/api/visa` | Stream visa guide (markdown) |
| `POST` | `/api/multi-city` | Stream multi-city itinerary |
| `POST` | `/api/insurance` | Stream insurance estimate |
| `POST` | `/api/flights` | Search flights (Skyscanner.co.in) |
| `POST` | `/api/hotels` | Search hotels (Booking.com / Agoda) |
| `POST` | `/api/restaurants` | Find restaurants |
| `POST` | `/api/sightseeing` | Get attractions + nearby places |
| `POST` | `/api/weather` | Weather forecast (wttr.in) |
| `POST` | `/api/visa-check` | Structured visa requirements + cost |

Streaming endpoints use **Server-Sent Events** (`text/event-stream`).

---

## 💡 Notes

- Flight, hotel, and restaurant prices are **indicative** — scraped/estimated via Tavily + LLM. Always verify on the source site before booking.
- Visa requirements are based on LLM knowledge + Tavily search. **Always confirm with the official embassy before travel.**
- Weather uses [wttr.in](https://wttr.in) — no API key required.
- Forex uses [exchangerate-api.com](https://exchangerate-api.com) free tier — no API key required.

