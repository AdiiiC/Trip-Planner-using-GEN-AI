# TripMind — AI-Powered Trip Planner

A full-stack travel intelligence platform built with **GenAI**. Plan itineraries, calculate multi-destination budgets, track flight prices, find hotels & restaurants, check visa requirements, and explore sightseeing — all in one place.

**Backend:** FastAPI + LangGraph + Groq (Llama 3.3 70B)  
**Frontend:** Next.js 15 · TypeScript · Tailwind CSS v4 · Framer Motion · shadcn-style components

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

