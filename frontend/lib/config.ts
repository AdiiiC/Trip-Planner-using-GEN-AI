/**
 * Single source of truth for frontend runtime configuration.
 *
 * Every value that used to be a literal scattered across components lives here,
 * so changing a timeout or an upstream URL is a one-line edit instead of a grep.
 * Nothing secret belongs in this file: it is bundled into the browser.
 */

/**
 * Backend origin.
 *
 * Empty in the browser: requests go to /api on this domain and the Next rewrite
 * (see next.config.ts) forwards them to FastAPI, so they are same-origin and
 * CORS never applies. Server components must stay absolute -- Node's fetch
 * cannot resolve a relative URL and throws on one.
 */
const BACKEND_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export const API_BASE_URL = typeof window === "undefined" ? BACKEND_ORIGIN : "";

/** Third-party endpoints called directly from the browser. */
export const EXTERNAL_ENDPOINTS = {
  photonGeocode: "https://photon.komoot.io/api/",
  wikipediaSummary: "https://en.wikipedia.org/api/rest_v1/page/summary/",
  osmTiles: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
} as const;

/** Cache lifetimes, in milliseconds. */
export const CACHE_TTL_MS = {
  /** sessionStorage cache for idempotent POST lookups. */
  session: 10 * 60 * 1000,
  /** react-query staleTime for cheap, frequently re-rendered queries. */
  queryShort: 5 * 60 * 1000,
  /** react-query staleTime for search-backed queries. */
  queryMedium: 10 * 60 * 1000,
  /** react-query staleTime for near-static data (forex, city photos). */
  queryLong: 60 * 60 * 1000,
} as const;

/** Network timeouts, in milliseconds. */
export const REQUEST_TIMEOUT_MS = {
  autocomplete: 5_000,
  default: 30_000,
} as const;

/** UI timings, in milliseconds. */
export const UI_TIMING_MS = {
  autocompleteDebounce: 250,
  toastShort: 3_000,
  toastLong: 8_000,
} as const;

/**
 * Browser-storage keys.
 *
 * These are the literal strings already written to users' browsers, so they are
 * reproduced verbatim — renaming one silently signs people out or drops their
 * saved plans. The two namespaces (`wayfare:` and `tripmind_`) are a historical
 * accident; unify them only behind a migration that reads the old key first.
 */
export const STORAGE_KEYS = {
  authToken: "wayfare:auth:token",
  budgetPlans: "wayfare:budget:plans:v1",
  userRates: "wayfare:budget:userRates:v1",
  tripHistory: "tripmind_history",
  recentCities: "tripmind_recent_cities",
  cookieConsent: "cookie_consent",
  /** Prefix — the full key is `${sessionCachePrefix}:${path}:${body}`. */
  sessionCachePrefix: "tripmind_cache",
} as const;
