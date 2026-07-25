"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Search, Star, ExternalLink, Zap } from "lucide-react";
import { addDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { api } from "@/lib/api";
import type { HotelResult, HotelSearchResult } from "@/lib/types";
import { formatINR, cn } from "@/lib/utils";
import { SkeletonCard } from "@/components/ui/skeleton";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";
import { CityHero } from "@/components/ui/CityHero";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const today = new Date();
const tomorrow = addDays(today, 1);
const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function HotelFinder() {
  const [city, setCity] = useState("");
  const [range, setRange] = useState<DateRange | undefined>({ from: today, to: tomorrow });
  const [guests, setGuests] = useState(1);
  const [rooms, setRooms] = useState(1);
  const [tier, setTier] = useState("any");
  const [result, setResult] = useState<HotelSearchResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const check_in = range?.from ? iso(range.from) : iso(today);
      const check_out = range?.to ? iso(range.to) : iso(tomorrow);
      return api.searchHotels({ city, check_in, check_out, guests, rooms, budget_tier: tier });
    },
    onSuccess: setResult,
  });

  const canSearch = !!city.trim() && !!range?.from && !!range?.to;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-4xl md:text-5xl leading-[1] tracking-tight text-[var(--fg)] mb-2">
          Hotel Finder
        </h1>
        <p className="text-[var(--fg-muted)] text-[15px]">
          Price suggestions · Booking.com · MakeMyTrip · Agoda
        </p>
      </div>

      {/* Query card */}
      <div className="surface p-5 md:p-6 mb-6 space-y-5">
        <div className="grid gap-4 md:grid-cols-[1.4fr_1.6fr_auto_auto_auto]">
          <div className="space-y-1.5">
            <Label>City</Label>
            <CityAutocomplete value={city} onChange={setCity} placeholder="Da Nang, Kuala Lumpur…" />
          </div>

          <div className="space-y-1.5">
            <Label>Check-in · Check-out</Label>
            <DateRangePicker value={range} onChange={setRange} data-testid="hotel-date-range" />
          </div>

          <div className="space-y-1.5">
            <Label>Guests</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={guests}
              onChange={(e) => setGuests(+e.target.value || 1)}
              className="w-20"
              data-testid="hotel-guests"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Rooms</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={rooms}
              onChange={(e) => setRooms(+e.target.value || 1)}
              className="w-20"
              data-testid="hotel-rooms"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Budget tier</Label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="input-dark h-9 w-36 !bg-[var(--surface-2)]"
              data-testid="hotel-tier"
            >
              <option value="any">Any</option>
              <option value="budget">Budget</option>
              <option value="mid-range">Mid-range</option>
              <option value="luxury">Luxury</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[11px] text-[var(--fg-dim)] font-mono uppercase tracking-[0.1em]">
            {range?.from && range?.to
              ? `${format(range.from, "MMM d")} → ${format(range.to, "MMM d, yyyy")}`
              : "Select a date range"}
          </p>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSearch}
            data-testid="hotel-search-btn"
          >
            <Search className="w-4 h-4" strokeWidth={1.75} />
            {mutation.isPending ? "Searching…" : "Find Hotels"}
          </Button>
        </div>
      </div>

      {mutation.isError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-400 text-sm mb-4">
          {mutation.error?.message}
        </div>
      )}

      {mutation.isPending && (
        <div className="grid sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {result && !mutation.isPending && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <CityHero city={result.city} />

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-display text-3xl leading-tight tracking-tight text-[var(--fg)]">
                  {result.city}
                </h2>
                <p className="text-[var(--fg-muted)] text-sm">
                  {result.check_in} → {result.check_out} · {result.nights} night(s) · {result.guests} guest(s)
                </p>
              </div>
              {result.cheapest_per_night_inr > 0 && (
                <div className="surface px-4 py-2 !border-[var(--accent-ring)]">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
                    From / night
                  </p>
                  <p className="font-display text-3xl leading-none text-[var(--accent-hover)]">
                    {formatINR(result.cheapest_per_night_inr)}
                  </p>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {result.results?.map((h, i) => (
                <HotelCard key={i} hotel={h} isFirst={i === 0} nights={result.nights} />
              ))}
            </div>

            <div className="surface p-4 flex items-start gap-3">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" strokeWidth={1.75} />
              <p className="text-sm text-[var(--fg-muted)]">
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

function HotelCard({
  hotel: h,
  isFirst,
  nights,
}: {
  hotel: HotelResult;
  isFirst: boolean;
  nights: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "surface p-5 hover-lift transition-all",
        isFirst && "!border-[var(--accent-ring)] shadow-[0_0_0_1px_var(--accent-ring)]"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[var(--fg)] font-medium truncate">{h.name}</p>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn(
                  "w-3 h-3",
                  i < (h.stars || 0)
                    ? "fill-amber-400 text-amber-400"
                    : "text-[var(--fg-dim)]"
                )}
                strokeWidth={1.5}
              />
            ))}
            {h.area && h.area !== "null" && (
              <span className="text-[11px] text-[var(--fg-muted)] ml-1">
                {h.area}
              </span>
            )}
          </div>
        </div>
        {isFirst && (
          <Badge variant="success" className="shrink-0">
            Best value
          </Badge>
        )}
      </div>

      <div className="flex items-end justify-between mt-4">
        <div>
          <p className="font-display text-2xl leading-none text-[var(--accent-hover)]">
            {h.price_per_night_inr > 0 ? formatINR(h.price_per_night_inr) : "—"}
          </p>
          <p className="text-[11px] text-[var(--fg-muted)] mt-1">per night</p>
          {nights > 1 && h.total_inr > 0 && (
            <p className="text-[11px] text-[var(--fg-muted)]">
              Total: {formatINR(h.total_inr)}
            </p>
          )}
        </div>
        <div className="text-right">
          {h.rating && (
            <p className="text-sm text-[var(--fg)] font-medium">{h.rating}</p>
          )}
          <p className="text-[11px] text-[var(--fg-muted)]">
            {h.source || "Booking.com"}
          </p>
          {h.url && (
            <a
              href={h.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[var(--accent-hover)] hover:text-[var(--accent)] flex items-center gap-0.5 justify-end mt-1"
            >
              View <ExternalLink className="w-3 h-3" strokeWidth={1.75} />
            </a>
          )}
        </div>
      </div>

      {h.highlights?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-4">
          {h.highlights.map((t, i) => (
            <span
              key={i}
              className="text-[10px] bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-2 py-0.5 text-[var(--fg-muted)]"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
