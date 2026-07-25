"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Sparkles, RefreshCw, CreditCard, Lightbulb,
  Plus, X, TrendingDown, TrendingUp, RotateCcw,
} from "lucide-react";
import { usePredictCash } from "@/lib/hooks";
import { staggerContainer, fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

// ─── types mirroring the API response ────────────────────────────────────────

interface AICityData {
  city: string;
  days: number;
  recommended_usd: number;
  range_low_usd: number;
  range_high_usd: number;
  per_day_usd: number;
  cost_level: "low" | "medium" | "high";
  cash_tip: string;
  breakdown: { category: string; usd: number; note: string }[];
}

// Per-category live amounts (user-adjusted)
type CityAdjustments = { usd: number }[];  // parallel to city.breakdown

// ─── helpers ─────────────────────────────────────────────────────────────────

const COST_COLORS = {
  low: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300",
  medium: "bg-amber-500/15 border-amber-500/30 text-amber-300",
  high: "bg-rose-500/15 border-rose-500/30 text-rose-300",
};

const STYLES = ["budget", "balanced", "comfort", "luxury"];

function fmt(n: number) {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// ─── CityCard ─────────────────────────────────────────────────────────────────

function CityCard({
  city,
  adjustments,
  onChange,
  onMinimize,
  onMaximize,
  onReset,
}: {
  city: AICityData;
  adjustments: CityAdjustments;
  onChange: (catIdx: number, usd: number) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onReset: () => void;
}) {
  const adjustedTotal = adjustments.reduce((s, a) => s + a.usd, 0);
  const aiTotal = city.recommended_usd;
  const delta = adjustedTotal - aiTotal;

  return (
    <motion.div variants={fadeUp}
      className="glass rounded-xl overflow-hidden border border-[#1e2540]">
      {/* City header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e2540] bg-white/2">
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold">{city.city}</span>
          <span className="text-[10px] text-[#8892b0]">{city.days}d · {fmt(city.per_day_usd)}/day</span>
          <span className={cn("text-[10px] font-medium rounded-full border px-2 py-0.5 capitalize",
            COST_COLORS[city.cost_level] ?? COST_COLORS.medium)}>
            {city.cost_level} cost
          </span>
        </div>
        {/* Total + delta */}
        <div className="text-right">
          <p className="text-lg font-bold text-white">{fmt(adjustedTotal)}</p>
          {delta !== 0 && (
            <p className={cn("text-[10px] font-medium", delta > 0 ? "text-amber-400" : "text-emerald-400")}>
              {delta > 0 ? "+" : ""}{fmt(delta)} vs AI
            </p>
          )}
        </div>
      </div>

      {/* Range bar */}
      <div className="px-4 pt-2 pb-1">
        <div className="relative h-1.5 rounded-full bg-white/10">
          <div className="absolute inset-y-0 rounded-full bg-indigo-500/30"
            style={{
              left: `${Math.max(0, (city.range_low_usd / (city.range_high_usd * 1.1)) * 100)}%`,
              width: `${Math.min(100, ((city.range_high_usd - city.range_low_usd) / (city.range_high_usd * 1.1)) * 100)}%`,
            }} />
          <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-400 border-2 border-[#131829] transition-all"
            style={{ left: `${Math.min(100, (adjustedTotal / (city.range_high_usd * 1.1)) * 100)}%` }} />
        </div>
        <div className="flex justify-between text-[9px] text-[#8892b0] mt-0.5">
          <span>{fmt(city.range_low_usd)}</span>
          <span>{fmt(city.range_high_usd)}</span>
        </div>
      </div>

      {/* Breakdown sliders */}
      <div className="px-4 pb-3 space-y-2 mt-1">
        {city.breakdown.map((cat, ci) => {
          const val = adjustments[ci]?.usd ?? cat.usd;
          const max = Math.max(cat.usd * 2, 10);
          return (
            <div key={cat.category} className="group">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-[#8892b0] group-hover:text-white transition-colors">{cat.category}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white">{fmt(val)}</span>
                  {cat.note && (
                    <span className="text-[9px] text-[#8892b0] hidden group-hover:inline">{cat.note}</span>
                  )}
                </div>
              </div>
              <input
                type="range"
                min={0}
                max={max}
                step={1}
                value={val}
                onChange={(e) => onChange(ci, +e.target.value)}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500 bg-white/10"
              />
            </div>
          );
        })}
      </div>

      {/* City actions */}
      <div className="flex gap-2 px-4 pb-3">
        <button onClick={onMinimize}
          className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-2 py-1 transition-colors">
          <TrendingDown className="w-3 h-3" /> Minimize
        </button>
        <button onClick={onReset}
          className="flex items-center gap-1 text-[10px] text-[#8892b0] hover:text-white border border-white/10 rounded-lg px-2 py-1 transition-colors">
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
        <button onClick={onMaximize}
          className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-lg px-2 py-1 transition-colors">
          <TrendingUp className="w-3 h-3" /> Maximize
        </button>
        {city.cash_tip && (
          <span className="ml-auto text-[9px] text-[#8892b0] flex items-center gap-1 max-w-[200px] text-right">
            <Lightbulb className="w-2.5 h-2.5 shrink-0 text-amber-400" /> {city.cash_tip}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CashPredictor() {
  const [cityInputs, setCityInputs] = useState<{ city: string; days: number }[]>([
    { city: "", days: 3 },
  ]);
  const [travelers, setTravelers] = useState(1);
  const [style, setStyle] = useState("balanced");
  const [prepaid, setPrepaid] = useState(0);

  // Per-city, per-category adjustments (initialized from API response)
  const [adjustments, setAdjustments] = useState<CityAdjustments[]>([]);

  const predict = usePredictCash();

  // ── input helpers ───────────────────────────────────────────────────────────
  const updateCity = (i: number, field: "city" | "days", v: string | number) =>
    setCityInputs((c) => c.map((x, idx) => idx === i ? { ...x, [field]: v } : x));

  const addCity = () => setCityInputs((c) => [...c, { city: "", days: 3 }]);
  const removeCity = (i: number) => setCityInputs((c) => c.filter((_, idx) => idx !== i));

  // ── run prediction ──────────────────────────────────────────────────────────
  const run = () => {
    const valid = cityInputs.filter((c) => c.city.trim());
    if (!valid.length) return;
    predict.mutate(
      { cities: valid, travelers, travel_style: style, prepaid_usd: prepaid },
      {
        onSuccess: (data) => {
          // Initialize adjustments = AI estimates
          setAdjustments(
            (data.cities ?? []).map((city) =>
              city.breakdown.map((cat: { usd: number }) => ({ usd: cat.usd }))
            )
          );
        },
      }
    );
  };

  // ── per-city actions ────────────────────────────────────────────────────────
  const setCatUsd = (cityIdx: number, catIdx: number, usd: number) =>
    setAdjustments((prev) =>
      prev.map((city, ci) =>
        ci === cityIdx
          ? city.map((cat, ki) => (ki === catIdx ? { usd } : cat))
          : city
      )
    );

  const resetCity = (cityIdx: number) =>
    setAdjustments((prev) =>
      prev.map((city, ci) =>
        ci === cityIdx
          ? (predict.data?.cities[ci]?.breakdown ?? []).map((b: { usd: number }) => ({ usd: b.usd }))
          : city
      )
    );

  const minimizeCity = (cityIdx: number) =>
    setAdjustments((prev) =>
      prev.map((city, ci) =>
        ci === cityIdx
          ? city.map((cat) => ({ usd: Math.round(cat.usd * 0.7) }))
          : city
      )
    );

  const maximizeCity = (cityIdx: number) =>
    setAdjustments((prev) =>
      prev.map((city, ci) =>
        ci === cityIdx
          ? city.map((cat) => ({ usd: Math.round(cat.usd * 1.4) }))
          : city
      )
    );

  // ── global actions ──────────────────────────────────────────────────────────
  const resetAll = () =>
    setAdjustments(
      (predict.data?.cities ?? []).map((city: AICityData) =>
        city.breakdown.map((b: { usd: number }) => ({ usd: b.usd }))
      )
    );

  const minimizeAll = () =>
    setAdjustments((prev) => prev.map((city) => city.map((c) => ({ usd: Math.round(c.usd * 0.7) }))));

  const maximizeAll = () =>
    setAdjustments((prev) => prev.map((city) => city.map((c) => ({ usd: Math.round(c.usd * 1.4) }))));

  // ── computed grand total ────────────────────────────────────────────────────
  const grandTotal = useMemo(
    () => adjustments.reduce((s, city) => s + city.reduce((cs, c) => cs + c.usd, 0), 0),
    [adjustments]
  );
  const aiTotal = predict.data?.total_recommended_usd ?? 0;

  const cities: AICityData[] = predict.data?.cities ?? [];
  const hasResult = cities.length > 0 && adjustments.length === cities.length;

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
      <p className="text-xs text-[#8892b0] mb-4">
        Per-city cash estimate, excluding prepaid costs. Adjust with sliders to fit your style.
      </p>

      {/* City rows */}
      <label className="text-[10px] text-[#8892b0] mb-1.5 block">Destinations</label>
      <div className="space-y-2 mb-3">
        {cityInputs.map((c, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={c.city}
              onChange={(e) => updateCity(i, "city", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="e.g. Bangkok, Thailand"
              className="input-dark flex-1"
            />
            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={1}
                max={90}
                value={c.days}
                onChange={(e) => updateCity(i, "days", +e.target.value)}
                className="input-dark w-16 text-center"
              />
              <span className="text-xs text-[#8892b0]">days</span>
            </div>
            {cityInputs.length > 1 && (
              <button onClick={() => removeCity(i)} aria-label="Remove"
                className="text-[#8892b0] hover:text-red-400 transition-colors px-1">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addCity}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add city
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
          <label className="text-[10px] text-[#8892b0] mb-1 block">Prepaid $ (excl.)</label>
          <input type="number" min={0} value={prepaid}
            onChange={(e) => setPrepaid(+e.target.value)} className="input-dark" />
        </div>
      </div>

      <button onClick={run} disabled={predict.isPending}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
        {predict.isPending
          ? <><RefreshCw className="w-4 h-4 animate-spin" /> Estimating…</>
          : <><Wallet className="w-4 h-4" /> Predict per-city cash</>}
      </button>

      {predict.isError && (
        <p className="mt-3 text-xs text-red-400">{(predict.error as Error)?.message}</p>
      )}

      {/* ── Results ── */}
      <AnimatePresence mode="wait">
        {hasResult && (
          <motion.div key="result" variants={staggerContainer} initial="hidden" animate="show"
            className="mt-6 space-y-4">

            {/* Grand total + global actions */}
            <motion.div variants={fadeUp}
              className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#8892b0] mb-0.5">
                    Total cash to carry
                  </p>
                  <p className="text-3xl font-bold gradient-text">
                    ${Math.round(grandTotal).toLocaleString("en-US")}
                  </p>
                  {grandTotal !== aiTotal && (
                    <p className={cn("text-xs mt-0.5", grandTotal > aiTotal ? "text-amber-400" : "text-emerald-400")}>
                      AI suggested {fmt(aiTotal)} · you adjusted {grandTotal > aiTotal ? "+" : ""}{fmt(grandTotal - aiTotal)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <button onClick={minimizeAll}
                      className="flex items-center gap-1 text-[10px] text-emerald-400 border border-emerald-500/30 rounded-lg px-2 py-1 hover:bg-emerald-500/10 transition-colors">
                      <TrendingDown className="w-3 h-3" /> Minimize all
                    </button>
                    <button onClick={maximizeAll}
                      className="flex items-center gap-1 text-[10px] text-amber-400 border border-amber-500/30 rounded-lg px-2 py-1 hover:bg-amber-500/10 transition-colors">
                      <TrendingUp className="w-3 h-3" /> Maximize all
                    </button>
                  </div>
                  <button onClick={resetAll}
                    className="flex items-center justify-center gap-1 text-[10px] text-[#8892b0] border border-white/10 rounded-lg px-2 py-1 hover:text-white hover:border-white/20 transition-colors">
                    <RotateCcw className="w-3 h-3" /> Reset to AI estimate
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Per-city cards */}
            {cities.map((city, ci) => (
              <CityCard
                key={city.city}
                city={city}
                adjustments={adjustments[ci] ?? city.breakdown.map((b) => ({ usd: b.usd }))}
                onChange={(ki, usd) => setCatUsd(ci, ki, usd)}
                onMinimize={() => minimizeCity(ci)}
                onMaximize={() => maximizeCity(ci)}
                onReset={() => resetCity(ci)}
              />
            ))}

            {/* Card vs cash */}
            {predict.data?.card_vs_cash && (
              <motion.div variants={fadeUp}
                className="flex items-start gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-xs text-sky-200">
                <CreditCard className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {predict.data.card_vs_cash}
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

            {predict.data?.summary && (
              <motion.p variants={fadeUp}
                className="text-xs text-[#8892b0] leading-relaxed border-t border-white/5 pt-3">
                {predict.data.summary}
              </motion.p>
            )}

            <motion.p variants={fadeUp} className="text-[10px] text-[#8892b0]/50">
              AI estimate — always carry a mix of cash and cards.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
