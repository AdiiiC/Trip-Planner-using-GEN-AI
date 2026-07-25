import type {
  BudgetInput,
  BudgetResult,
  FlightSearchInput,
  FlightSearchResult,
  HotelSearchInput,
  HotelSearchResult,
  InsuranceInput,
  MultiCityInput,
  PackingInput,
  PlanInput,
  RefineInput,
  RestaurantInput,
  RestaurantResult,
  SightseeingResult,
  VisaCheckInput,
  VisaCheckResult,
  VisaInput,
  WeatherInput,
  WeatherResult,
} from "./types";

const BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? ""        // same-origin fallback when self-hosted
    : "http://localhost:8000");

// ── sessionStorage TTL cache (10 min) ────────────────────────────────────────
// Prevents identical queries from re-hitting the backend within a session.

const CACHE_TTL = 10 * 60 * 1000;

function getCached<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { value, ts } = JSON.parse(raw) as { value: T; ts: number };
    if (Date.now() - ts > CACHE_TTL) { sessionStorage.removeItem(key); return null; }
    return value;
  } catch { return null; }
}

function setCached(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ value, ts: Date.now() }));
  } catch { /* sessionStorage full or unavailable — silently ignore */ }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Cached POST — returns sessionStorage hit if fresh, else fetches + caches. */
async function postCached<T>(path: string, body: unknown): Promise<T> {
  const key = `tripmind_cache:${path}:${JSON.stringify(body)}`;
  const cached = getCached<T>(key);
  if (cached !== null) return cached;
  const result = await post<T>(path, body);
  setCached(key, result);
  return result;
}

/**
 * Consume a Server-Sent-Events stream and call `onChunk` with each accumulated
 * text chunk.  Calls `onDone` when the stream ends or `onError` on failure.
 * Optional `extraHeaders` for captcha tokens etc.
 */
async function consumeSSE(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (e: Error) => void,
  extraHeaders?: Record<string, string>
) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const raw = decoder.decode(value, { stream: true });
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break;
        try {
          const { content } = JSON.parse(payload);
          accumulated += content;
          onChunk(accumulated);
        } catch {
          // skip malformed lines
        }
      }
    }
    onDone();
  } catch (e) {
    onError(e instanceof Error ? e : new Error(String(e)));
  }
}

// ── public API ───────────────────────────────────────────────────────────────

export const api = {
  // Budget is user-specific (different values every time) — no cache needed
  calculateBudget: (body: BudgetInput) =>
    post<BudgetResult>("/api/budget", body),

  // ── Streaming (never cached) ──────────────────────────────────────────────
  planTrip: (
    body: PlanInput,
    onChunk: (t: string) => void,
    onDone: () => void,
    onError: (e: Error) => void,
    captchaToken?: string
  ) => consumeSSE("/api/plan", body, onChunk, onDone, onError,
    captchaToken ? { "X-Captcha-Token": captchaToken } : undefined),

  refineTrip: (
    body: RefineInput,
    onChunk: (t: string) => void,
    onDone: () => void,
    onError: (e: Error) => void
  ) => consumeSSE("/api/refine", body, onChunk, onDone, onError),

  packingList: (
    body: PackingInput,
    onChunk: (t: string) => void,
    onDone: () => void,
    onError: (e: Error) => void
  ) => consumeSSE("/api/packing", body, onChunk, onDone, onError),

  visaInfo: (
    body: VisaInput,
    onChunk: (t: string) => void,
    onDone: () => void,
    onError: (e: Error) => void
  ) => consumeSSE("/api/visa", body, onChunk, onDone, onError),

  estimateInsurance: (
    body: InsuranceInput,
    onChunk: (t: string) => void,
    onDone: () => void,
    onError: (e: Error) => void
  ) => consumeSSE("/api/insurance", body, onChunk, onDone, onError),

  multiCityPlan: (
    body: MultiCityInput,
    onChunk: (t: string) => void,
    onDone: () => void,
    onError: (e: Error) => void,
    captchaToken?: string
  ) => consumeSSE("/api/multi-city", body, onChunk, onDone, onError,
    captchaToken ? { "X-Captcha-Token": captchaToken } : undefined),

  // ── Cached (10 min sessionStorage TTL) ───────────────────────────────────
  getSightseeing: (city: string, country = "") =>
    postCached<SightseeingResult>("/api/sightseeing", { city, country }),

  searchFlights: (body: FlightSearchInput) =>
    postCached<FlightSearchResult>("/api/flights", body),

  searchHotels: (body: HotelSearchInput) =>
    postCached<HotelSearchResult>("/api/hotels", body),

  findRestaurants: (body: RestaurantInput) =>
    postCached<RestaurantResult>("/api/restaurants", body),

  getWeather: (body: WeatherInput) =>
    postCached<WeatherResult>("/api/weather", body),

  checkVisa: (body: VisaCheckInput) =>
    postCached<VisaCheckResult>("/api/visa-check", body),

  getForexRates: async (): Promise<Record<string, number>> => {
    const key = "tripmind_cache:/api/forex:{}";
    const cached = getCached<Record<string, number>>(key);
    if (cached !== null) return cached;
    const res = await fetch(`${BASE}/api/forex?base=INR`);
    if (!res.ok) return {};
    const data = await res.json();
    const rates = data.rates ?? {};
    setCached(key, rates);
    return rates;
  },

  // ── New feature endpoints ────────────────────────────────────────────────
  convertCurrency: (amount: number, from: string, to: string) =>
    post<{
      amount: number; from: string; to: string; converted: number;
      amount_inr: number; rate: number; inverse_rate: number;
    }>("/api/currency-convert", { amount, from_currency: from, to_currency: to }),

  extractCosts: (itinerary: string, currency = "USD") =>
    post<{
      items: { name: string; category: string; amount: number; currency: string }[];
      total_estimate: number; currency: string;
    }>("/api/extract-costs", { itinerary, currency }),

  optimizeRoute: (stops: { city: string; lat: number; lng: number }[], fixedStart = true) =>
    post<{
      ordered_cities: string[];
      legs: { from: string; to: string; distance_km: number }[];
      total_distance_km: number;
    }>("/api/optimize-route", { stops, fixed_start: fixedStart }),

  bestTime: (destination: string) =>
    postCached<{
      destination: string;
      months: { month: string; score: number; weather: string; crowds: string; note: string }[];
      best_months: string[]; avoid_months: string[]; summary: string;
    }>("/api/best-time", { destination }),

  exportIcs: async (title: string, startDate: string,
    events: { title: string; day: number; start_time: string; duration_min: number; location?: string; notes?: string }[]
  ): Promise<Blob> => {
    const res = await fetch(`${BASE}/api/export/ics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, start_date: startDate, events }),
    });
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
  },

  getCityPhoto: async (city: string, country = ""): Promise<{ city: string; url: string; source: string }> => {
    const key = `tripmind_cache:/api/city-photo:${city.toLowerCase()}::${country.toLowerCase()}`;
    const cached = getCached<{ city: string; url: string; source: string }>(key);
    if (cached !== null) return cached;
    const qs = new URLSearchParams({ city, ...(country ? { country } : {}) }).toString();
    const res = await fetch(`${BASE}/api/city-photo?${qs}`);
    if (!res.ok) throw new Error("City photo failed");
    const data = await res.json();
    setCached(key, data);
    return data;
  },
};
