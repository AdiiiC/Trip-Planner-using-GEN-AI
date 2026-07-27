"use client";

import { useState } from "react";
import { CalendarPlus, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Props {
  city: string;
  days: number;
  travelDate: string;
  itinerary: string;
}

/**
 * Parses a markdown itinerary to extract day events for ICS export.
 * Looks for "## Day N" sections and "HH:MM" time patterns.
 */
function extractEvents(itinerary: string, days: number) {
  const events: Array<{ title: string; day: number; start_time: string; duration_min: number; location: string; notes: string }> = [];
  const dayBlocks = itinerary.split(/(?=^## Day \d)/m).filter(b => /^## Day/.test(b));

  dayBlocks.forEach((block, dayIdx) => {
    // Find time-based entries: "09:00 - Visit Temple" or "**09:00** Temple"
    const timePattern = /(\d{1,2}:\d{2})\s*[-–—]?\s*\*{0,2}([^\n*]+)/g;
    let match;
    while ((match = timePattern.exec(block)) !== null) {
      events.push({
        title: match[2].trim().slice(0, 100),
        day: dayIdx + 1,
        start_time: match[1].padStart(5, "0"),
        duration_min: 90,
        location: "",
        notes: "",
      });
    }
  });

  // If no time-based events found, create one event per day
  if (events.length === 0) {
    for (let i = 1; i <= Math.min(days, 14); i++) {
      events.push({ title: `Day ${i}`, day: i, start_time: "09:00", duration_min: 480, location: "", notes: "" });
    }
  }

  return events;
}

export function CalendarExportButton({ city, days, travelDate, itinerary }: Props) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleExport = async () => {
    if (!itinerary || loading) return;
    setLoading(true);
    try {
      const events = extractEvents(itinerary, days);
      const icsContent = await api.exportIcs(
        `${city} — ${days}-day trip`,
        travelDate || new Date().toISOString().slice(0, 10),
        events
      );
      // Download the .ics file
      const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tripmind-${city.toLowerCase().replace(/\s+/g, "-")}.ics`;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
      toast.success("Calendar file downloaded — import into Google/Apple/Outlook Calendar");
      setTimeout(() => setDone(false), 3000);
    } catch (e) {
      toast.error("Failed to export calendar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={!itinerary || loading}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
      title="Export to Google/Apple/Outlook Calendar"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : done ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <CalendarPlus className="w-3.5 h-3.5" />}
      {done ? "Done" : "Calendar"}
    </button>
  );
}
