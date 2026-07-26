"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Sparkles, RefreshCw, CreditCard, Lightbulb, Plus, X,
} from "lucide-react";
import { usePredictCash } from "@/lib/hooks";
import { staggerContainer, fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

// ─── types ───────────────────────────────────────────────────────────────────

interface CityResult {
  city: string;
  days: number;
  interpretation: string;
  recommended_usd: number;
  range_low_usd: number;
  range_high_usd: number;
  per_day_usd: number;
  cost_level: "low" | "medium" | "high";
  cash_tip: string;
  breakdown: { category: string; usd: number; reasoning: string }[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const COST_BADGE: Record<string, string> = {
  low:    "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  medium: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  high:   "bg-rose-500/15 border-rose-500/30 text-rose-300",
};

const STYLES = ["budget", "balanced", "comfort", "luxury"];

const PLACEHOLDERS = [
  "e.g. I'll eat only street food and local diners. Splitting all Grab rides with 3 people. Visiting Marble Mountains and Hoi An. No nightlife, a little souvenir shopping.",
  "e.g. Mid-range restaurants mostly. Taking the MRT + some Grab. Visiting KLCC, Batu Caves, Petronas. An evening at a rooftop bar. Light shopping at Petaling Street.",
  "e.g. Local hawker centres and kopitiam only. Walking most places + occasional bus. Visiting Gardens by the Bay, Universal Studios. No nightlife or shopping.",
];

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// ─── Result card per city ─────────────────────────────────────────────────────

function CityResultCard({ city }: { city: CityResult }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  return (
    <motion.div variants={fadeUp} className="glass rounded-xl overflow-hidden border border-[#1e2540]">
      {/* Header row */}
      <div className="px-4 py-3 border-b border-[#1e2540] flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-white font-semibold">{city.city}</span>
            <span className="text-[10px] text-[#8892b0]">{city.days}d</span>
            <span className={cn("text-[10px] font-medium rounded-full border px-2 py-0.5 capitalize",
              COST_BADGE[city.cost_level] ?? COST_BADGE.medium)}>
              {city.cost_level} cost
            </span>
          </div>
          {/* AI interpretation of the notes */}
          {city.interpretation && (
            <p className="text-xs text-[#8892b0] leading-relaxed max-w-md">{city.interpretation}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-white">{fmt(city.recommended_usd)}</p>
          <p className="text-[10px] text-[#8892b0]">
            {fmt(city.range_low_usd)} – {fmt(city.range_high_usd)} · {fmt(city.per_day_usd)}/day
          </p>
        </div>
      </div>

      {/* Breakdown toggle */}
      <button
        onClick={() => setShowBreakdown((b) => !b)}
        className="w-full text-left px-4 py-2 text-xs text-[#8892b0] hover:text-white transition-colors flex items-center justify-between"
      >
        <span>See breakdown</span>
        <span>{showBreakdown ? "▲" : "▼"}</span>
      </button>

      <AnimatePresence>
        {showBreakdown && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-1.5 border-t border-[#1e2540]">
              {city.breakdown.map((b, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-xs">
                  <div>
                    <span className="text-white">{b.category}</span>
                    {b.reasoning && (
                      <span className="text-[#8892b0] ml-2">— {b.reasoning}</span>
                    )}
                  </div>
                  <span className="text-emerald-300 font-medium shrink-0">{fmt(b.usd)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cash tip */}
      {city.cash_tip && (
        <div className="px-4 pb-3 flex items-start gap-1.5 text-[10px] text-amber-300/80">
          <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" /> {city.cash_tip}
        </div>
      )}
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CashPredictor() {
  const [cityInputs, setCityInputs] = useState([
    { city: "", days: 3, notes: "" },
  ]);
  const [travelers, setTravelers] = useState(1);
  const [style, setStyle] = useState("balanced");
  const [prepaid, setPrepaid] = useState(0);

  const predict = usePredictCash();

  const updateCity = (i: number, field: "city" | "days" | "notes", v: string | number) =>
    setCityInputs((c) => c.map((x, idx) => idx === i ? { ...x, [field]: v } : x));
  const addCity  = () => setCityInputs((c) => [...c, { city: "", days: 3, notes: "" }]);
  const removeCity = (i: number) => setCityInputs((c) => c.filter((_, idx) => idx !== i));

  const run = () => {
    const valid = cityInputs.filter((c) => c.city.trim());
    if (!valid.length) return;
    predict.mutate({ cities: valid, travelers, travel_style: style, prepaid_usd: prepaid });
  };

  const cities: CityResult[] = predict.data?.cities ?? [];

  return (
    <div className="glass rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Wallet className="w-4 h-4 text-indigo-400" />
        <p className="text-sm font-semibold text-white">Cash-to-Carry Predictor</p>
        <span className="text-[10px] text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> AI
        </span>
      </div>
      <p className="text-xs text-[#8892b0] mb-5">
        Describe your spending plans per city in plain English — the AI will estimate how much cash to carry, excluding prepaid costs.
      </p>

      {/* City inputs */}
      <div className="space-y-4 mb-4">
        {cityInputs.map((c, i) => (
          <div key={i} className="rounded-xl border border-[#1e2540] bg-white/2 p-3 space-y-2">
            {/* City name + days */}
            <div className="flex gap-2 items-center">
              <input
                value={c.city}
                onChange={(e) => updateCity(i, "city", e.target.value)}
                placeholder="City (e.g. Da Nang, Vietnam)"
                className="input-dark flex-1"
              />
              <input
                type="number"
                min={1}
                max={90}
                value={c.days}
                onChange={(e) => updateCity(i, "days", +e.target.value)}
                className="input-dark w-16 text-center"
              />
              <span className="text-xs text-[#8892b0] shrink-0">days</span>
              {cityInputs.length > 1 && (
                <button onClick={() => removeCity(i)} aria-label="Remove"
                  className="text-[#8892b0] hover:text-red-400 transition-colors px-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Free-text spending description */}
            <textarea
              value={c.notes}
              onChange={(e) => updateCity(i, "notes", e.target.value)}
              rows={3}
              placeholder={PLACEHOLDERS[i % PLACEHOLDERS.length]}
              className="input-dark resize-none text-xs leading-relaxed"
            />
            <p className="text-[9px] text-[#8892b0]">
              Mention: food choices · transport splits · specific attractions · shopping / nightlife plans
            </p>
          </div>
        ))}

        <button onClick={addCity}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add another city
        </button>
      </div>

      {/* Global params */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div>
          <label className="text-[10px] text-[#8892b0] mb-1 block">Travelers</label>
          <input type="number" min={1} max={50} value={travelers}
            onChange={(e) => setTravelers(+e.target.value)} className="input-dark" />
        </div>
        <div>
          <label className="text-[10px] text-[#8892b0] mb-1 block">Style</label>
          <select value={style} onChange={(e) => setStyle(e.target.value)} className="input-dark capitalize">
            {STYLES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-[#8892b0] mb-1 block">Prepaid $</label>
          <input type="number" min={0} value={prepaid}
            onChange={(e) => setPrepaid(+e.target.value)} className="input-dark" />
        </div>
      </div>

      <button onClick={run} disabled={predict.isPending}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
        {predict.isPending
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Estimating…</>
          : <><Wallet className="w-4 h-4" /> Estimate my cash</>}
      </button>

      {predict.isError && (
        <p className="mt-3 text-xs text-red-400">{(predict.error as Error)?.message}</p>
      )}

      {/* ── Results ── */}
      <AnimatePresence mode="wait">
        {cities.length > 0 && (
          <motion.div key="result" variants={staggerContainer} initial="hidden" animate="show"
            className="mt-6 space-y-4">

            {/* Grand total */}
            <motion.div variants={fadeUp}
              className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#8892b0] mb-0.5">
                  Total cash to carry
                </p>
                <p className="text-4xl font-bold gradient-text">
                  {fmt(predict.data?.total_recommended_usd ?? 0)}
                </p>
                <p className="text-xs text-[#8892b0] mt-0.5">
                  Range {fmt(predict.data?.total_range_low_usd ?? 0)} – {fmt(predict.data?.total_range_high_usd ?? 0)}
                </p>
              </div>
              <p className="text-xs text-[#8892b0] max-w-xs">{predict.data?.summary}</p>
            </motion.div>

            {/* Per-city cards */}
            {cities.map((city) => (
              <CityResultCard key={city.city} city={city} />
            ))}

            {/* Card vs cash */}
            {predict.data?.card_vs_cash && (
              <motion.div variants={fadeUp}
                className="flex items-start gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-xs text-sky-200">
                <CreditCard className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {predict.data.card_vs_cash}
              </motion.div>
            )}

            {/* Tips */}
            {(predict.data?.tips ?? []).length > 0 && (
              <motion.div variants={fadeUp} className="space-y-1.5">
                {predict.data!.tips.map((t: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-[#8892b0]">
                    <Lightbulb className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> {t}
                  </div>
                ))}
              </motion.div>
            )}

            <motion.p variants={fadeUp} className="text-[10px] text-[#8892b0]/50">
              AI estimate — carry a mix of cash and cards and keep a small buffer.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
