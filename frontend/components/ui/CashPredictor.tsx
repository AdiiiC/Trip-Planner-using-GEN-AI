"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Sparkles, RefreshCw, CreditCard, Lightbulb, Plus, X } from "lucide-react";
import { usePredictCash } from "@/lib/hooks";
import { CountUp } from "@/components/ui/CountUp";
import { staggerContainer, fadeUp } from "@/lib/motion";

const STYLES = ["budget", "balanced", "comfort", "luxury"];

/**
 * AI cash-on-hand predictor for the Budget page.
 * Estimates how much physical USD to carry, excluding prepaid costs.
 */
export function CashPredictor({
  defaultDestinations = [],
  defaultDays = 5,
  defaultTravelers = 1,
  defaultPrepaidUsd = 0,
}: {
  defaultDestinations?: string[];
  defaultDays?: number;
  defaultTravelers?: number;
  defaultPrepaidUsd?: number;
}) {
  const [destinations, setDestinations] = useState<string[]>(
    defaultDestinations.length ? defaultDestinations : [""]
  );
  const [days, setDays] = useState(defaultDays);
  const [travelers, setTravelers] = useState(defaultTravelers);
  const [style, setStyle] = useState("balanced");
  const [prepaid, setPrepaid] = useState(defaultPrepaidUsd);
  const predict = usePredictCash();

  const updateDest = (i: number, v: string) =>
    setDestinations((d) => d.map((x, idx) => (idx === i ? v : x)));
  const addDest = () => setDestinations((d) => [...d, ""]);
  const removeDest = (i: number) => setDestinations((d) => d.filter((_, idx) => idx !== i));

  const run = () => {
    const dests = destinations.map((d) => d.trim()).filter(Boolean);
    if (!dests.length) return;
    predict.mutate({
      destinations: dests,
      duration_days: days,
      travelers,
      travel_style: style,
      prepaid_usd: prepaid,
    });
  };

  const data = predict.data;

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <Wallet className="w-4 h-4 text-indigo-400" />
        <p className="text-sm font-semibold text-white">Cash-to-Carry Predictor</p>
        <span className="text-[10px] text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> AI
        </span>
      </div>
      <p className="text-xs text-[#8892b0] mb-4">
        Estimate how much physical cash (USD) to keep in hand — excludes prepaid flights & stays.
      </p>

      {/* Destinations */}
      <label className="text-[10px] text-[#8892b0] mb-1 block">Destinations</label>
      <div className="space-y-2 mb-3">
        {destinations.map((d, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={d}
              onChange={(e) => updateDest(i, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="e.g. Da Nang, Vietnam"
              className="input-dark flex-1"
            />
            {destinations.length > 1 && (
              <button onClick={() => removeDest(i)} aria-label="Remove destination"
                className="px-2 rounded-lg border border-[#1e2540] text-[#8892b0] hover:text-red-400 transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <button onClick={addDest}
          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add destination
        </button>
      </div>

      {/* Params */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div>
          <label className="text-[10px] text-[#8892b0] mb-1 block">Days</label>
          <input type="number" min={1} max={365} value={days}
            onChange={(e) => setDays(+e.target.value)} className="input-dark" />
        </div>
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
          : <><Wallet className="w-4 h-4" /> Predict cash to carry</>}
      </button>

      {predict.isError && (
        <p className="mt-3 text-xs text-red-400">{(predict.error as Error)?.message ?? "Prediction failed."}</p>
      )}

      <AnimatePresence mode="wait">
        {data && (
          <motion.div key="result" variants={staggerContainer} initial="hidden" animate="show"
            className="mt-5 space-y-4">
            {/* Headline number */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8892b0] mb-1">
                Recommended cash to carry
              </p>
              <p className="text-4xl font-bold gradient-text">
                $<CountUp value={data.recommended_cash_usd} decimals={0} />
              </p>
              <p className="text-[#8892b0] text-xs mt-1">
                Range ${data.range_low_usd?.toLocaleString()} – ${data.range_high_usd?.toLocaleString()}
                {data.per_day_usd ? ` · ~$${data.per_day_usd}/day` : ""}
                {data.per_person_usd ? ` · ~$${data.per_person_usd}/person` : ""}
              </p>
            </motion.div>

            {/* Breakdown */}
            {data.breakdown?.length > 0 && (
              <motion.div variants={fadeUp} className="space-y-1.5">
                {data.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs rounded-lg bg-white/3 border border-white/5 px-3 py-2">
                    <div>
                      <span className="text-white font-medium">{b.category}</span>
                      {b.note && <span className="text-[#8892b0] ml-2">{b.note}</span>}
                    </div>
                    <span className="text-emerald-300 font-semibold shrink-0">${b.usd?.toLocaleString()}</span>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Card vs cash */}
            {data.card_vs_cash && (
              <motion.div variants={fadeUp}
                className="flex items-start gap-2 rounded-xl bg-sky-500/10 border border-sky-500/20 p-3 text-xs text-sky-200">
                <CreditCard className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {data.card_vs_cash}
              </motion.div>
            )}

            {/* Tips */}
            {data.tips?.length > 0 && (
              <motion.div variants={fadeUp} className="space-y-1.5">
                {data.tips.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-[#8892b0]">
                    <Lightbulb className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" /> {t}
                  </div>
                ))}
              </motion.div>
            )}

            {data.summary && (
              <motion.p variants={fadeUp} className="text-xs text-[#8892b0] leading-relaxed border-t border-white/5 pt-3">
                {data.summary}
              </motion.p>
            )}

            <motion.p variants={fadeUp} className="text-[10px] text-[#8892b0]/60">
              AI estimate — carry a mix of cash & cards, and keep an emergency buffer.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
