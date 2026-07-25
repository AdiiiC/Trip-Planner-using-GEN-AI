"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Search, RefreshCw } from "lucide-react";
import { useBestTime } from "@/lib/hooks";
import { staggerContainer, fadeUp } from "@/lib/motion";

function scoreColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  if (score >= 30) return "bg-orange-500";
  return "bg-rose-500";
}

/** Best-time-to-visit month heatmap powered by /api/best-time. */
export function BestTimeWidget({ defaultDestination = "" }: { defaultDestination?: string }) {
  const [dest, setDest] = useState(defaultDestination);
  const [active, setActive] = useState("");
  const { data, isFetching, refetch } = useBestTime(active, active.length > 1);

  const go = () => { if (dest.trim()) setActive(dest.trim()); };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-4 h-4 text-emerald-400" />
        <p className="text-sm font-semibold text-white">Best Time to Visit</p>
      </div>

      <div className="flex gap-2 mb-4">
        <input value={dest} onChange={(e) => setDest(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Destination (e.g. Bali)" className="input-dark flex-1" />
        <button onClick={go} disabled={isFetching || !dest.trim()}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
          {isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {data && data.months?.length > 0 && (
          <motion.div key={data.destination} variants={staggerContainer} initial="hidden" animate="show">
            <motion.div variants={fadeUp} className="grid grid-cols-6 gap-1.5 mb-3">
              {data.months.map((m) => (
                <div key={m.month} className="text-center group relative">
                  <div className={`h-10 rounded-md ${scoreColor(m.score)} opacity-80 hover:opacity-100 transition-opacity cursor-default`}
                    style={{ opacity: 0.35 + (m.score / 100) * 0.65 }} />
                  <span className="text-[9px] text-[var(--fg-muted)] mt-1 block">{m.month.slice(0, 3)}</span>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10 w-40 glass rounded-lg p-2 text-[10px] text-left pointer-events-none">
                    <p className="font-semibold text-white">{m.month} · {m.score}/100</p>
                    <p className="text-[var(--fg-muted)]">{m.weather}</p>
                    <p className="text-[var(--fg-muted)]">Crowds: {m.crowds}</p>
                  </div>
                </div>
              ))}
            </motion.div>
            <motion.div variants={fadeUp} className="flex flex-wrap gap-2 mb-2">
              {data.best_months?.map((m) => (
                <span key={m} className="text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-full px-2 py-0.5">
                  Best: {m}
                </span>
              ))}
              {data.avoid_months?.map((m) => (
                <span key={m} className="text-[10px] bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-full px-2 py-0.5">
                  Avoid: {m}
                </span>
              ))}
            </motion.div>
            <motion.p variants={fadeUp} className="text-xs text-[var(--fg-muted)] leading-relaxed">{data.summary}</motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
