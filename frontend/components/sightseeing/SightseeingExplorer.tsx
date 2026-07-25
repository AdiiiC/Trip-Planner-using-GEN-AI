"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Search, Clock, MapPin, Ticket, Lightbulb, Route, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import type { Attraction, NearbyPlace, SightseeingResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";

const CATEGORY_COLORS: Record<string, string> = {
  heritage:    "bg-amber-500/20 text-amber-300 border-amber-500/30",
  nature:      "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  food:        "bg-orange-500/20 text-orange-300 border-orange-500/30",
  adventure:   "bg-red-500/20 text-red-300 border-red-500/30",
  culture:     "bg-violet-500/20 text-violet-300 border-violet-500/30",
  beach:       "bg-sky-500/20 text-sky-300 border-sky-500/30",
  museum:      "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "theme-park":"bg-pink-500/20 text-pink-300 border-pink-500/30",
  religious:   "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

const CATEGORY_ICONS: Record<string, string> = {
  heritage: "Heritage", nature: "Nature", food: "Food", adventure: "Adventure", culture: "Culture",
  beach: "Beach", museum: "Museum", "theme-park": "Theme Park", religious: "Religious",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS);

export function SightseeingExplorer() {
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [result, setResult] = useState<SightseeingResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.getSightseeing(city, country),
    onSuccess: (data) => setResult(data),
  });

  const handleSearch = () => {
    if (!city.trim()) return;
    mutation.mutate();
  };

  const attractions = result?.attractions.filter(
    a => filter === "all" || a.category === filter
  ) ?? [];

  const usedCategories = [...new Set(result?.attractions.map(a => a.category) ?? [])];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Sightseeing Explorer</h1>
        <p className="text-[#8892b0]">Top attractions with entry fees · Nearby day trips ≤ 2 hours · Web-sourced data</p>
      </div>

      {/* Search bar */}
      <div className="glass rounded-2xl p-4 mb-6 flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <CityAutocomplete
            value={city}
            onChange={setCity}
            placeholder="City (e.g. Da Nang)"
          />
        </div>
        <div className="w-40">
          <input
            value={country}
            onChange={e => setCountry(e.target.value)}
            placeholder="Country (optional)"
            className="input-dark"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={mutation.isPending || !city.trim()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl font-medium text-sm disabled:opacity-60 transition-colors">
          <Search className="w-4 h-4" />
          {mutation.isPending ? "Searching…" : "Explore"}
        </button>
      </div>

      {mutation.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm mb-6">
          {mutation.error?.message ?? "Search failed. Is the backend running?"}
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{result.city}</h2>
                <p className="text-[#8892b0] text-sm">{result.attractions.length} attractions · {result.nearby_places.length} nearby places</p>
              </div>
              {result.sources.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-[#8892b0]">Sources:</span>
                  {result.sources.slice(0, 3).map((s, i) => {
                    let domain = "";
                    try { domain = new URL(s).hostname.replace("www.", ""); } catch {}
                    return domain ? (
                      <a key={i} href={s} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 rounded-full px-2 py-0.5">
                        {domain} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : null;
                  })}
                </div>
              )}
            </div>

            {/* Category filters */}
            {usedCategories.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilter("all")}
                  className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                    filter === "all" ? "bg-indigo-600 text-white border-indigo-500" : "border-white/10 text-[#8892b0] hover:text-white"
                  )}>
                  All ({result.attractions.length})
                </button>
                {usedCategories.map(cat => (
                  <button key={cat} onClick={() => setFilter(cat)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                      filter === cat
                        ? CATEGORY_COLORS[cat] ?? "bg-indigo-600 text-white border-indigo-500"
                        : "border-white/10 text-[#8892b0] hover:text-white"
                    )}>
                    {CATEGORY_ICONS[cat] ?? cat}
                  </button>
                ))}
              </div>
            )}

            {/* Attractions grid */}
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Top Attractions</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {attractions.map((att, i) => (
                  <AttractionCard key={i} attraction={att} />
                ))}
              </div>
            </div>

            {/* Nearby places */}
            {result.nearby_places.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Route className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">Nearby Day Trips</h3>
                  <span className="text-xs text-[#8892b0] border border-white/10 rounded-full px-2 py-0.5">
                    ≤ 2 hours away
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {result.nearby_places.map((place, i) => (
                    <NearbyCard key={i} place={place} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {!result && !mutation.isPending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-2xl p-12 flex flex-col items-center text-center gap-4"
          >
            <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="36" cy="36" r="34" fill="#1a1f36" stroke="#1e2540" strokeWidth="1.5"/>
              <path d="M36 18 C36 18 22 30 22 40 C22 47.7 28.3 54 36 54 C43.7 54 50 47.7 50 40 C50 30 36 18 36 18Z" fill="#131829" stroke="#6366f1" strokeWidth="1.5"/>
              <circle cx="36" cy="40" r="5" fill="#6366f1" opacity="0.8"/>
              <line x1="36" y1="18" x2="36" y2="14" stroke="#c084fc" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="36" cy="13" r="2" fill="#c084fc"/>
            </svg>
            <div>
              <p className="text-white font-medium mb-1">Discover any destination</p>
              <p className="text-[#8892b0] text-sm max-w-xs">
                Enter a city to get top attractions with real entry prices and nearby day trips.
              </p>
            </div>
          </motion.div>
        )}

        {mutation.isPending && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0,1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Attraction card ──────────────────────────────────────────────────────────

function AttractionCard({ attraction: a }: { attraction: Attraction }) {
  const categoryClass = CATEGORY_COLORS[a.category] ?? "bg-white/10 text-white/70 border-white/10";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 hover:border-indigo-500/30 transition-all hover:-translate-y-0.5 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-white font-semibold text-sm leading-tight">{a.name}</h4>
        <span className={cn("shrink-0 text-[10px] font-medium rounded-full border px-2 py-0.5 capitalize", categoryClass)}>
          {CATEGORY_ICONS[a.category] ?? a.category}
        </span>
      </div>

      <p className="text-[#8892b0] text-xs leading-relaxed flex-1">{a.description}</p>

      <div className="space-y-1.5">
        {a.location && a.location !== "null" && (
          <div className="flex items-center gap-1.5 text-xs text-[#8892b0]">
            <MapPin className="w-3 h-3 shrink-0" /> {a.location}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs">
          <Ticket className="w-3 h-3 shrink-0 text-emerald-400" />
          <span className="text-emerald-300 font-medium">{a.entry_cost}</span>
          {a.entry_cost_usd !== null && a.entry_cost_usd !== undefined && a.entry_cost_usd > 0 && (
            <span className="text-[#8892b0]">(~${a.entry_cost_usd})</span>
          )}
        </div>
        {a.time_needed && (
          <div className="flex items-center gap-1.5 text-xs text-[#8892b0]">
            <Clock className="w-3 h-3 shrink-0" /> {a.time_needed}
          </div>
        )}
      </div>

      {a.tips && (
        <div className="flex items-start gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2 text-xs text-indigo-300">
          <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" /> {a.tips}
        </div>
      )}
    </motion.div>
  );
}

// ─── Nearby card ──────────────────────────────────────────────────────────────

function NearbyCard({ place: p }: { place: NearbyPlace }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 hover:border-emerald-500/30 transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-white font-semibold text-sm">{p.name}</h4>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-2 py-0.5">
            {p.travel_time}
          </span>
          <span className="text-[10px] text-[#8892b0]">{p.distance_km}</span>
        </div>
      </div>

      <p className="text-[#8892b0] text-xs leading-relaxed mb-3">{p.highlights}</p>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-emerald-300">
          <Ticket className="w-3 h-3" /> {p.entry_cost}
        </div>
        {p.how_to_get && p.how_to_get !== "null" && (
          <span className="text-[#8892b0]">{p.how_to_get}</span>
        )}
      </div>
    </motion.div>
  );
}
