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

const BASE = "http://localhost:8000";

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

/**
 * Consume a Server-Sent-Events stream and call `onChunk` with each accumulated
 * text chunk.  Calls `onDone` when the stream ends or `onError` on failure.
 */
async function consumeSSE(
  path: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (e: Error) => void
) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  calculateBudget: (body: BudgetInput) =>
    post<BudgetResult>("/api/budget", body),

  planTrip: (
    body: PlanInput,
    onChunk: (t: string) => void,
    onDone: () => void,
    onError: (e: Error) => void
  ) => consumeSSE("/api/plan", body, onChunk, onDone, onError),

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

  getSightseeing: (city: string, country = "") =>
    post<SightseeingResult>("/api/sightseeing", { city, country }),

  getForexRates: async (): Promise<Record<string, number>> => {
    const res = await fetch(`${BASE}/api/forex?base=INR`);
    if (!res.ok) return {};
    const data = await res.json();
    return data.rates ?? {};
  },

  searchFlights: (body: FlightSearchInput) =>
    post<FlightSearchResult>("/api/flights", body),

  searchHotels: (body: HotelSearchInput) =>
    post<HotelSearchResult>("/api/hotels", body),

  findRestaurants: (body: RestaurantInput) =>
    post<RestaurantResult>("/api/restaurants", body),

  getWeather: (body: WeatherInput) =>
    post<WeatherResult>("/api/weather", body),

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
    onError: (e: Error) => void
  ) => consumeSSE("/api/multi-city", body, onChunk, onDone, onError),

  checkVisa: (body: VisaCheckInput) =>
    post<VisaCheckResult>("/api/visa-check", body),
};
