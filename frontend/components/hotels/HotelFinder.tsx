"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Hotel, Search, Star, ExternalLink, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { HotelResult, HotelSearchResult } from "@/lib/types";
import { formatINR, cn } from "@/lib/utils";

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export function HotelFinder() {
  const [city, setCity]           = useState("");
  const [checkIn, setCheckIn]     = useState(today);
  const [checkOut, setCheckOut]   = useState(tomorrow);
  const [guests, setGuests]       = useState(1);
  const [rooms, setRooms]         = useState(1);
  const [tier, setTier]           = useState("any");
  const [result, setResult]       = useState<HotelSearchResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.searchHotels({ city, check_in: checkIn, check_out: checkOut, guests, rooms, budget_tier: tier }),
    onSuccess: setResult,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Hotel Finder</h1>
        <p className="text-[#8892b0]">Price suggestions · Booking.com · MakeMyTrip · Agoda</p>
      </div>

      <div className="glass rounded-2xl p-5 mb-6 space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1">
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">City</label>
            <input value={city} onChange={e => setCity(e.target.value)}
              placeholder="Da Nang, Kuala Lumpur…" className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">Check-in</label>
            <input type="date" value={checkIn} min={today}
              onChange={e => setCheckIn(e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">Check-out</label>
            <input type="date" value={checkOut} min={checkIn}
              onChange={e => setCheckOut(e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">Guests</label>
            <input type="number" min={1} max={10} value={guests}
              onChange={e => setGuests(+e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">Rooms</label>
            <input type="number" min={1} max={5} value={rooms}
              onChange={e => setRooms(+e.target.value)} className="input-dark" />
          </div>
          <div>
            <label className="text-xs font-medium text-[#8892b0] mb-1 block">Budget tier</label>
            <select value={tier} onChange={e => setTier(e.target.value)} className="input-dark">
              <option value="any">Any</option>
              <option value="budget">🪙 Budget</option>
              <option value="mid-range">💳 Mid-range</option>
              <option value="luxury">💎 Luxury</option>
            </select>
          </div>
        </div>
        <button onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !city.trim()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-60">
          <Search className="w-4 h-4" />
          {mutation.isPending ? "Searching…" : "Find Hotels"}
        </button>
      </div>

      {mutation.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm mb-4">
          {mutation.error?.message}
        </div>
      )}

      {mutation.isPending && (
        <div className="glass rounded-2xl p-12 flex flex-col items-center gap-3">
          <div className="flex gap-2">
            {[0,1,2].map(i => (
              <div key={i} className="w-3 h-3 rounded-full bg-indigo-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-[#8892b0] text-sm">Searching Booking.com, MakeMyTrip, Agoda…</p>
        </div>
      )}

      <AnimatePresence>
        {result && !mutation.isPending && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xl font-bold text-white">{result.city}</h2>
                <p className="text-[#8892b0] text-sm">
                  {result.check_in} → {result.check_out} · {result.nights} night(s) · {result.guests} guest(s)
                </p>
              </div>
              {result.cheapest_per_night_inr > 0 && (
                <div className="glass rounded-xl px-4 py-2 border border-emerald-500/30">
                  <p className="text-xs text-[#8892b0]">From / night</p>
                  <p className="text-2xl font-bold text-emerald-400">{formatINR(result.cheapest_per_night_inr)}</p>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {result.results?.map((h, i) => <HotelCard key={i} hotel={h} isFirst={i === 0} nights={result.nights} />)}
            </div>

            <div className="glass rounded-xl p-4 flex items-start gap-3">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-[#8892b0]">
                <span className="text-amber-300 font-medium">Note: </span>
                {result.note}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HotelCard({ hotel: h, isFirst, nights }: { hotel: HotelResult; isFirst: boolean; nights: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("glass rounded-xl p-4 hover:-translate-y-0.5 transition-all", isFirst ? "border border-emerald-500/30" : "")}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-white font-semibold">{h.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            {Array.from({ length: h.stars || 0 }).map((_, i) => (
              <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
            ))}
            <span className="text-xs text-[#8892b0] ml-1">{h.area}</span>
          </div>
        </div>
        {isFirst && (
          <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 shrink-0">
            Best value
          </span>
        )}
      </div>

      <div className="flex items-end justify-between mt-3">
        <div>
          <p className="text-emerald-400 font-bold text-xl">{h.price_per_night_inr > 0 ? formatINR(h.price_per_night_inr) : "—"}</p>
          <p className="text-xs text-[#8892b0]">per night</p>
          {nights > 1 && h.total_inr > 0 && (
            <p className="text-xs text-[#8892b0]">Total: {formatINR(h.total_inr)}</p>
          )}
        </div>
        <div className="text-right">
          {h.rating && <p className="text-sm text-white font-medium">{h.rating}</p>}
          <p className="text-xs text-[#8892b0]">{h.source || "Booking.com"}</p>
          {h.url && (
            <a href={h.url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 justify-end mt-1">
              View <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {h.highlights?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {h.highlights.map((t, i) => (
            <span key={i} className="text-[10px] bg-white/5 border border-white/10 rounded-full px-2 py-0.5 text-[#8892b0]">
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
