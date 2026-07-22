"use client";

import { useState, useEffect, useCallback } from "react";
import type { SavedTrip } from "./types";

const STORAGE_KEY = "tripmind_history";

export function useTripHistory() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTrips(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (updated: SavedTrip[]) => {
    setTrips(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
  };

  const save = useCallback((city: string, days: number, itinerary: string) => {
    const trip: SavedTrip = {
      id: Date.now().toString(),
      title: `${city} · ${days}d`,
      city,
      days,
      itinerary,
      savedAt: new Date().toISOString(),
    };
    persist([trip, ...trips].slice(0, 20)); // keep last 20
    return trip.id;
  }, [trips]);

  const remove = useCallback((id: string) => {
    persist(trips.filter(t => t.id !== id));
  }, [trips]);

  const load = useCallback((id: string) => {
    return trips.find(t => t.id === id);
  }, [trips]);

  return { trips, save, remove, load };
}

/** Encode itinerary + metadata as a URL-safe base64 share link */
export function buildShareUrl(city: string, days: number, itinerary: string): string {
  const payload = JSON.stringify({ city, days, itinerary });
  const encoded = btoa(unescape(encodeURIComponent(payload)));
  return `${window.location.origin}/planner?share=${encodeURIComponent(encoded)}`;
}

/** Download current itinerary as a .md file */
export function downloadMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
