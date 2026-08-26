"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Receipt, Zap } from "lucide-react";
import { parseCosts } from "@/lib/tripModel";

const CATEGORY_COLORS: Record<string, string> = {
  flight: "#6366f1",
  stay: "#10b981",
  sightseeing: "#f59e0b",
  food: "#ef4444",
  transport: "#06b6d4",
  extra: "#a855f7",
};

const colorFor = (c: string) => CATEGORY_COLORS[c?.toLowerCase()] ?? CATEGORY_COLORS.extra;

function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${(currency || "").toUpperCase()} ${Math.round(amount).toLocaleString("en-US")}`;
  }
}

export function CostBreakdown({ itinerary, currency }: { itinerary: string; currency: string }) {
  // Read straight from the itinerary text; this was previously a second full-plan LLM call.
  const data = useMemo(() => parseCosts(itinerary, currency), [itinerary, currency]);

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of data.items) {
      const key = (item.category || "extra").toLowerCase();
      totals.set(key, (totals.get(key) ?? 0) + (Number(item.amount) || 0));
    }
    return [...totals.entries()]
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  const total = useMemo(
    () => data.items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    [data],
  );

  const resultCurrency = data.currency || currency || "USD";

  if (!itinerary.trim()) {
    return (
      <p className="text-[var(--fg-muted)] text-sm text-center py-8">
        Generate an itinerary first — costs are pulled straight from it.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <p className="text-sm font-medium text-white">Cost breakdown</p>
            <span className="text-[10px] text-emerald-300 bg-emerald-600/10 border border-emerald-500/30 rounded-full px-2 py-0.5 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" /> Instant
            </span>
          </div>
          <p className="text-xs text-[var(--fg-muted)] mt-1 max-w-md">
            Reads every price mentioned in your itinerary and groups it into categories.
          </p>
        </div>
      </div>

      {data.items.length === 0 && (
        <p className="text-[var(--fg-muted)] text-sm text-center py-6">
          No prices were mentioned in this itinerary.
        </p>
      )}

      {data.items.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-white/5 bg-white/3 p-4 flex flex-col justify-center">
              <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Estimated total</p>
              <p className="text-3xl font-bold text-white mt-1">
                {money(total, resultCurrency)}
              </p>
              <p className="text-[11px] text-[var(--fg-muted)] mt-1">
                across {data.items.length} line {data.items.length === 1 ? "item" : "items"}
              </p>
            </div>

            <div className="rounded-xl border border-white/5 bg-white/3 p-2 h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="category" innerRadius={40} outerRadius={68} paddingAngle={2}>
                    {byCategory.map((d) => (
                      <Cell key={d.category} fill={colorFor(d.category)} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#17171b", border: "1px solid #1f1f24", borderRadius: 10, fontSize: 12 }}
                    formatter={(v: unknown) => money(Number(v) || 0, resultCurrency)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {byCategory.map((d) => (
              <span key={d.category} className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)] capitalize">
                <span className="w-2 h-2 rounded-full" style={{ background: colorFor(d.category) }} />
                {d.category} · <span className="text-white">{money(d.value, resultCurrency)}</span>
              </span>
            ))}
          </div>

          <div className="rounded-xl border border-white/5 divide-y divide-white/5">
            {data.items.map((item, i) => (
              <div key={`${item.name}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colorFor(item.category) }} />
                  <span className="text-sm text-white truncate">{item.name}</span>
                  <span className="text-[10px] text-[var(--fg-muted)] capitalize shrink-0">{item.category}</span>
                </div>
                <span className="text-sm text-emerald-300 shrink-0">
                  {money(Number(item.amount) || 0, item.currency || resultCurrency)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-[var(--fg-muted)]">
            Estimates only — prices are read from the generated text and may not reflect live rates.
          </p>
        </motion.div>
      )}
    </div>
  );
}
