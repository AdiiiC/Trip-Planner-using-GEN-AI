"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Plane, Search, Luggage, Clock, Zap, ExternalLink, ArrowRight } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import type { FlightResult, FlightSearchResult } from "@/lib/types";
import { formatINR, cn } from "@/lib/utils";
import { SkeletonFlightCard } from "@/components/ui/skeleton";

// Airline name → domain for Clearbit logo
const AIRLINE_DOMAINS: Record<string, string> = {
  "air india":        "airindia.in",
  "indigo":           "goindigo.in",
  "spicejet":         "spicejet.com",
  "vistara":          "airvistara.com",
  "akasa":            "akasaair.com",
  "thai airways":     "thaiairways.com",
  "airasia":          "airasia.com",
  "air asia":         "airasia.com",
  "singapore airlines": "singaporeair.com",
  "emirates":         "emirates.com",
  "qatar airways":    "qatarairways.com",
  "etihad":           "etihad.com",
  "lufthansa":        "lufthansa.com",
  "british airways":  "britishairways.com",
  "malaysia airlines":"malaysiaairlines.com",
  "vietnam airlines": "vietnamairlines.com",
  "scoot":            "flyscoot.com",
  "thai lion":        "lionairthai.com",
  "batik air":        "batikair.com",
  "united":           "united.com",
  "delta":            "delta.com",
  "american":         "aa.com",
  "cathay":           "cathaypacific.com",
};

function getAirlineLogo(airline: string): string | null {
  const lower = airline.toLowerCase();
  for (const [key, domain] of Object.entries(AIRLINE_DOMAINS)) {
    if (lower.includes(key)) return `https://logo.clearbit.com/${domain}`;
  }
  return null;
}

const POPULAR_ROUTES = [
  { origin: "Bengaluru (BLR)", destination: "Ho Chi Minh City (SGN)" },
  { origin: "Delhi (DEL)",     destination: "Bangkok (BKK)" },
  { origin: "Mumbai (BOM)",    destination: "Kuala Lumpur (KUL)" },
  { origin: "Bengaluru (BLR)", destination: "Singapore (SIN)" },
  { origin: "Chennai (MAA)",   destination: "Bali (DPS)" },
];

const today = new Date().toISOString().slice(0, 10);

export function FlightTracker() {
  const [origin, setOrigin]         = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate]             = useState(today);
  const [passengers, setPassengers] = useState(1);
  const [result, setResult]         = useState<FlightSearchResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.searchFlights({ origin, destination, date, passengers }),
    onSuccess: setResult,
  });

  const handleSearch = () => {
    if (!origin.trim() || !destination.trim()) return;
    mutation.mutate();
  };

  const setRoute = (o: string, d: string) => {
    setOrigin(o);
    setDestination(d);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-4xl md:text-5xl leading-[1] tracking-tight text-[var(--fg)] mb-2">Flight Price Tracker</h1>
          <p className="text-[var(--fg-muted)]">
            One-way prices · Check-in baggage included · Powered by
            <a href="https://www.skyscanner.co.in" target="_blank" rel="noopener noreferrer"
              className="ml-1 text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-0.5">
              Skyscanner.co.in <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
        {/* Skyscanner badge */}
        <a href="https://www.skyscanner.co.in" target="_blank" rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-2 glass rounded-xl px-3 py-1.5 text-xs text-emerald-300 border border-emerald-500/30 hover:border-emerald-400/50 transition-colors">
          <Plane className="w-3.5 h-3.5" /> Verify on Skyscanner.co.in
        </a>
      </div>

      {/* Search panel */}
      <div className="glass rounded-2xl p-5 mb-6 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">From</label>
            <input value={origin} onChange={e => setOrigin(e.target.value)}
              placeholder="Bengaluru / BLR" className="input-dark" />
          </div>
          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">To</label>
            <input value={destination} onChange={e => setDestination(e.target.value)}
              placeholder="Ho Chi Minh City / SGN" className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Date (One-way)</label>
            <input type="date" value={date} min={today}
              onChange={e => setDate(e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Passengers</label>
            <input type="number" min={1} max={9} value={passengers}
              onChange={e => setPassengers(+e.target.value)} className="input-dark w-full" />
          </div>
        </div>

        {/* Baggage filter badge — always active */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-3 py-1 text-xs font-medium text-emerald-300">
            <Luggage className="w-3.5 h-3.5" />
            ✓ Check-in Baggage Filter: ON
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-full px-3 py-1 text-xs font-medium text-emerald-300">
            <Plane className="w-3.5 h-3.5" />
            ✓ One-way
          </div>
        </div>

        <button onClick={handleSearch} disabled={mutation.isPending || !origin || !destination}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60">
          <Search className="w-4 h-4" />
          {mutation.isPending ? "Searching Skyscanner…" : "Search Flights"}
        </button>

        {/* Popular routes */}
        <div>
          <p className="text-xs text-[var(--fg-muted)] mb-2">Popular routes:</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_ROUTES.map(r => (
              <button key={r.origin + r.destination}
                onClick={() => setRoute(r.origin, r.destination)}
                className="text-xs rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-1 text-[var(--fg-muted)] hover:text-white transition-colors">
                {r.origin} → {r.destination}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mutation.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm mb-4">
          {mutation.error?.message ?? "Search failed. Is the backend running?"}
        </div>
      )}

      {/* Loading state — skeletons */}
      {mutation.isPending && (
        <div className="space-y-3">
          {[0,1,2].map(i => <SkeletonFlightCard key={i} />)}
        </div>
      )}

      {/* Results */}
      <AnimatePresence>
        {result && !mutation.isPending && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">
                  {result.route || `${origin} → ${destination}`}
                </h2>
                <p className="text-[var(--fg-muted)] text-sm">{result.date} · {result.type} · {result.baggage_filter}</p>
              </div>
              {result.cheapest_inr > 0 && (
                <div className="glass rounded-xl px-4 py-2 border border-emerald-500/30">
                  <p className="text-xs text-[var(--fg-muted)]">From</p>
                  <p className="text-2xl font-bold text-emerald-400">{formatINR(result.cheapest_inr)}</p>
                </div>
              )}
            </div>

            {/* Flight cards */}
            {result.results?.length > 0 ? (
              <div className="space-y-3">
                {result.results.map((f, i) => (
                  <FlightCard key={i} flight={f} isFirst={i === 0} rank={i} />
                ))}
              </div>
            ) : (
              <div className="glass rounded-xl p-8 text-center">
                <p className="text-[var(--fg-muted)]">No results found. Try adjusting your search.</p>
              </div>
            )}

            {/* Note + verify link */}
            <div className="glass rounded-xl p-4 flex items-start gap-3">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--fg-muted)]">
                <span className="text-amber-300 font-medium">Important: </span>
                {result.note}&nbsp;
                <a
                  href={`https://www.skyscanner.co.in/transport/flights/${encodeURIComponent(origin)}/${encodeURIComponent(destination)}/${date.replace(/-/g, "")}/?adults=${passengers}&cabinclass=economy&adultsv2=${passengers}&childrenv2=&infants=0&checkedBaggage=1`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1">
                  Check live on Skyscanner.co.in <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Sources */}
            {result.sources?.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-[var(--fg-muted)]">Sources:</span>
                {result.sources.filter(Boolean).slice(0, 4).map((s, i) => {
                  let domain = "";
                  try { domain = new URL(s).hostname.replace("www.", ""); } catch {}
                  return domain ? (
                    <a key={i} href={s} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
                      {domain} <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : null;
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FlightCard({ flight: f, isFirst, rank }: { flight: FlightResult; isFirst: boolean; rank: number }) {
  const hasTimings = f.departure && f.departure !== "null" && f.arrival && f.arrival !== "null";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isEstimate = (f as any).is_estimate !== false;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "glass rounded-xl p-4 transition-all hover:-translate-y-0.5",
        isFirst ? "border-emerald-500/30 border" : ""
      )}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Airline + badges */}
        <div className="min-w-[120px] space-y-1">
          <div className="flex items-center gap-2">
            {(() => {
              const logo = getAirlineLogo(f.airline);
              return logo ? (
                <Image
                  src={logo}
                  alt={f.airline}
                  width={24}
                  height={24}
                  unoptimized
                  className="rounded object-contain bg-white p-0.5"
                  onError={e => ((e.target as HTMLImageElement).style.display = "none")}
                />
              ) : null;
            })()}
            <p className="text-white font-semibold">{f.airline}</p>
          </div>
          {f.flight_number && f.flight_number !== "null" && (
            <p className="text-xs text-[var(--fg-muted)]">{f.flight_number}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {isFirst && (
              <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5">
                Cheapest
              </span>
            )}
            {rank === 1 && !isFirst && (
              <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5">
                Mid-range
              </span>
            )}
            {rank === 2 && (
              <span className="text-[10px] font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30 rounded-full px-2 py-0.5">
                Premium
              </span>
            )}
            {isEstimate && (
              <span className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">
                Estimate
              </span>
            )}
          </div>
        </div>

        {/* Times + route */}
        <div className="flex items-center gap-3 flex-1 justify-center min-w-[180px]">
          {hasTimings ? (
            <>
              <div className="text-center">
                <p className="text-white font-bold text-lg">{f.departure}</p>
                <p className="text-xs text-[var(--fg-muted)]">Depart</p>
              </div>
              <div className="flex-1 flex flex-col items-center gap-0.5">
                {f.duration && f.duration !== "null" && (
                  <div className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                    <Clock className="w-3 h-3" /> {f.duration}
                  </div>
                )}
                <div className="flex items-center w-full">
                  <div className="flex-1 border-t border-dashed border-[var(--border)]" />
                  <ArrowRight className="w-3 h-3 text-[var(--fg-muted)] mx-1" />
                </div>
                <p className="text-[10px] text-[var(--fg-muted)]">{f.stops}</p>
              </div>
              <div className="text-center">
                <p className="text-white font-bold text-lg">{f.arrival}</p>
                <p className="text-xs text-[var(--fg-muted)]">Arrive</p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {f.duration && f.duration !== "null" && (
                <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                  <Clock className="w-3 h-3" /> {f.duration}
                </span>
              )}
              <span className="text-xs text-[var(--fg-muted)]">{f.stops}</span>
              <span className="text-[10px] text-[var(--fg-muted)]/50 border border-white/10 rounded px-1.5 py-0.5">
                Timings: verify on Skyscanner
              </span>
            </div>
          )}
        </div>

        {/* Baggage */}
        <div className="flex items-center gap-1 text-xs">
          <Luggage className={cn("w-3.5 h-3.5", f.baggage?.includes("included") ? "text-emerald-400" : "text-amber-400")} />
          <span className={f.baggage?.includes("included") ? "text-emerald-300" : "text-amber-300"}>
            {f.baggage}
          </span>
        </div>

        {/* Price */}
        <div className="text-right">
          <p className="font-display text-3xl leading-tight tracking-tight text-[var(--fg)]">{f.price_inr > 0 ? formatINR(f.price_inr) : "—"}</p>
          <p className="text-xs text-[var(--fg-muted)]">{f.source || "Skyscanner"}</p>
        </div>
      </div>
    </motion.div>
  );
}
