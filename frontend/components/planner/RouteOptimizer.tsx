"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Route, RefreshCw, Check, ArrowRight } from "lucide-react";
import { useGeocodedStops, useOptimizeRoute } from "@/lib/hooks";
import { routeDistanceKm } from "@/lib/geocode";

const fmtKm = (n: number) => `${Math.round(n).toLocaleString("en-US")} km`;

/**
 * Suggests a shorter ordering for the multi-city stops.
 * Remount (via `key`) whenever the city list changes so results never go stale.
 */
export function RouteOptimizer({
  cities,
  onApply,
}: {
  cities: string[];
  onApply: (ordered: string[]) => void;
}) {
  const named = cities.map((c) => c.trim()).filter(Boolean);
  const geo = useGeocodedStops(named);
  const optimize = useOptimizeRoute();

  const stops = geo.data ?? [];
  const result = optimize.data;
  const currentKm = stops.length >= 2 ? routeDistanceKm(stops) : 0;
  const savedKm = result ? currentKm - result.total_distance_km : 0;
  const worthApplying = savedKm >= 1;

  // Fewer than 3 stops leaves nothing to reorder once the origin is fixed.
  if (named.length < 3) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/3 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Route className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-medium text-white">Route optimiser</span>
        </div>
        <button
          type="button"
          disabled={stops.length < 3 || optimize.isPending}
          onClick={() => optimize.mutate(stops)}
          className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
        >
          {optimize.isPending
            ? <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Optimising…</span>
            : geo.isLoading ? "Locating cities…" : "Find shortest route"}
        </button>
      </div>

      <p className="text-[10px] text-[var(--fg-muted)]">
        Reorders your stops to cut travel distance, keeping{" "}
        <span className="text-white">{named[0]}</span> as the starting city.
      </p>

      {geo.isError && (
        <p className="text-[11px] text-red-400">Could not locate these cities. Try more specific names.</p>
      )}
      {optimize.isError && (
        <p className="text-[11px] text-red-400">Optimisation failed. Please try again.</p>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-1 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {result.ordered_cities.map((c, i) => (
                  <span key={`${c}-${i}`} className="flex items-center gap-1.5">
                    {i > 0 && <ArrowRight className="w-3 h-3 text-[var(--fg-muted)]" />}
                    <span className="text-[11px] rounded-full border border-emerald-500/20 bg-emerald-600/10 text-emerald-300 px-2 py-0.5">
                      {c}
                    </span>
                  </span>
                ))}
              </div>

              <p className="text-[11px] text-[var(--fg-muted)]">
                {worthApplying ? (
                  <>
                    <span className="text-emerald-300 font-medium">Saves {fmtKm(savedKm)}</span>{" "}
                    — {fmtKm(currentKm)} → {fmtKm(result.total_distance_km)}
                  </>
                ) : (
                  <>Your current order is already the shortest ({fmtKm(result.total_distance_km)}).</>
                )}
              </p>

              {worthApplying && (
                <button
                  type="button"
                  onClick={() => onApply(result.ordered_cities)}
                  className="flex items-center gap-1 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-2.5 py-1 transition-colors"
                >
                  <Check className="w-3 h-3" /> Apply this order
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
