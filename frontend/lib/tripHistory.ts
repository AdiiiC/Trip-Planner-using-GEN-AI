"use client";

import { useState, useEffect, useCallback } from "react";
import type { SavedTrip } from "./types";

const STORAGE_KEY = "tripmind_history";

function persistToStorage(updated: SavedTrip[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
}

export function useTripHistory() {
  const [trips, setTrips] = useState<SavedTrip[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTrips(JSON.parse(raw));
    } catch {}
  }, []);

  // BUG-011 fix: functional state updates avoid stale closure
  const save = useCallback((city: string, days: number, itinerary: string) => {
    const trip: SavedTrip = {
      id: Date.now().toString(),
      title: `${city} · ${days}d`,
      city,
      days,
      itinerary,
      savedAt: new Date().toISOString(),
    };
    setTrips(prev => {
      const updated = [trip, ...prev].slice(0, 20);
      persistToStorage(updated);
      return updated;
    });
    return trip.id;
  }, []); // no deps — functional update reads latest state

  const remove = useCallback((id: string) => {
    setTrips(prev => {
      const updated = prev.filter(t => t.id !== id);
      persistToStorage(updated);
      return updated;
    });
  }, []);

  const load = useCallback((id: string) => {
    // Read directly from storage to avoid stale state
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const all: SavedTrip[] = JSON.parse(raw);
        return all.find(t => t.id === id);
      }
    } catch {}
    return undefined;
  }, []);

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
