"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Search, Star, Clock, Lightbulb } from "lucide-react";
import { api } from "@/lib/api";
import type { Restaurant, RestaurantResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";
import { SkeletonCard } from "@/components/ui/Skeleton";

function StarRating({ rating }: { rating: string }) {
  const num = parseFloat(rating);
  if (isNaN(num)) {
    return (
      <div className="flex items-center gap-1 text-xs text-[#8892b0]">
        <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {rating}
      </div>
    );
  }
  // Normalise to 5-star scale (handles both /5 and /10 ratings)
  const outOf5 = num > 5 ? (num / 10) * 5 : num;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn(
            "w-3 h-3 transition-colors",
            i <= Math.floor(outOf5)
              ? "text-amber-400 fill-amber-400"
              : i - 0.5 <= outOf5
              ? "text-amber-400 fill-amber-400/40"
              : "text-[#8892b0]"
          )}
        />
      ))}
      <span className="text-xs text-[#8892b0] ml-1">{num}</span>
    </div>
  );
}

const TIER_COLORS: Record<string, string> = {
  "cheap eats":  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "mid-range":   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "fine dining": "bg-violet-500/20 text-violet-300 border-violet-500/30",
};

export function RestaurantFinder() {
  const [city, setCityV]    = useState("");
  const [cuisine, setCuisine] = useState("any");
  const [budget, setBudget] = useState("any");
  const [result, setResult] = useState<RestaurantResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.findRestaurants({ city, cuisine, budget }),
    onSuccess: setResult,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Restaurant Finder</h1>
        <p className="text-[#8892b0]">Top eats with price ranges · Must-try dishes · Web-sourced</p>
      </div>

      <div className="glass rounded-2xl p-5 mb-6">
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">City</label>
            <CityAutocomplete
              value={city}
              onChange={setCityV}
              placeholder="Ho Chi Minh City, Penang…"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">Cuisine</label>
            <input value={cuisine === "any" ? "" : cuisine}
              onChange={e => setCuisine(e.target.value || "any")}
              placeholder="Vietnamese, Seafood, Indian…" className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">Budget tier</label>
            <select value={budget} onChange={e => setBudget(e.target.value)} className="input-dark">
              <option value="any">Any</option>
              <option value="cheap eats">Cheap eats</option>
              <option value="mid-range">Mid-range</option>
              <option value="fine dining">Fine dining</option>
            </select>
          </div>
        </div>
        <button onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !city.trim()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60">
          <Search className="w-4 h-4" />
          {mutation.isPending ? "Searching…" : "Find Restaurants"}
        </button>
      </div>

      {mutation.isPending && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0,1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
        </div>
      )}

      <AnimatePresence>
        {result && !mutation.isPending && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-4">
              <h2 className="text-xl font-bold text-white">{result.city}</h2>
              <p className="text-[#8892b0] text-sm">
                {result.cuisine_filter !== "any" && `${result.cuisine_filter} · `}
                {result.budget_filter !== "any" && `${result.budget_filter} · `}
                {result.restaurants?.length} results
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.restaurants?.map((r, i) => <RestaurantCard key={i} restaurant={r} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Guard against LLM returning the literal string "null"
function val(v: string | null | undefined): string | null {
  if (!v || v === "null" || v === "undefined" || v.trim() === "") return null;
  return v;
}

function RestaurantCard({ restaurant: r }: { restaurant: Restaurant }) {
  const tierClass = TIER_COLORS[r.price_tier] ?? "bg-white/10 text-white/70 border-white/10";
  const area    = val(r.area);
  const hours   = val(r.hours);
  const rating  = val(r.rating);
  const tips    = val(r.tips);
  const mustTry = (r.must_try ?? []).filter(d => val(d));
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 hover:-translate-y-0.5 transition-all flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-white font-semibold">{r.name}</h4>
          <p className="text-xs text-[#8892b0]">
            {r.cuisine}{area ? ` · ${area}` : ""}
          </p>
        </div>
        <span className={cn("shrink-0 text-[10px] font-medium rounded-full border px-2 py-0.5", tierClass)}>
          {r.price_tier}
        </span>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-emerald-400 font-medium">{r.price_range}</span>
        </div>
        {rating && <StarRating rating={rating} />}
        {hours && (
          <div className="flex items-center gap-1 text-xs text-[#8892b0]">
            <Clock className="w-3 h-3" /> {hours}
          </div>
        )}
      </div>

      {mustTry.length > 0 && (
        <div>
          <p className="text-xs text-[#8892b0] mb-1">Must try:</p>
          <div className="flex flex-wrap gap-1">
            {mustTry.map((d, i) => (
              <span key={i} className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-full px-2 py-0.5">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {tips && (
        <div className="flex items-start gap-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-2 text-xs text-indigo-300">
          <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" /> {tips}
        </div>
      )}
    </motion.div>
  );
}
