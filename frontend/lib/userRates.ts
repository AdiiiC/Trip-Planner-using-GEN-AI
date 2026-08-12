// Shares the Exchange Rates entered on the Budget form with other widgets on the
// page (e.g. the Currency Converter) so they convert using the user's own
// orientexchange values instead of a separate live rate.

import { useSyncExternalStore } from "react";

export type UserRates = Record<string, number>; // currency (upper) -> INR per 1 unit

const KEY = "wayfare:budget:userRates:v1";
let rates: UserRates = load();
const listeners = new Set<() => void>();

function load(): UserRates {
  if (typeof window === "undefined") return { INR: 1 };
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { INR: 1, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return { INR: 1 };
  }
}

export function getUserRates(): UserRates {
  return rates;
}

export function setUserRates(next: UserRates): void {
  rates = { INR: 1, ...next };
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(KEY, JSON.stringify(rates)); } catch { /* ignore */ }
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useUserRates(): UserRates {
  return useSyncExternalStore(subscribe, getUserRates, getUserRates);
}

/** INR-pivot conversion using the user's rates. Returns null if a rate is missing. */
export function convertWithUserRates(
  amount: number,
  from: string,
  to: string,
  r: UserRates = rates,
): { converted: number; rate: number } | null {
  const rf = from === "INR" ? 1 : r[from];
  const rt = to === "INR" ? 1 : r[to];
  if (!rf || !rt || rf <= 0 || rt <= 0) return null;
  const rate = rf / rt;
  return { converted: amount * rate, rate };
}
