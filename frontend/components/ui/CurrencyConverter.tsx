"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { useCurrencyConvert } from "@/lib/hooks";
import { CountUp } from "@/components/ui/CountUp";
import { spring } from "@/lib/motion";
import { useUserRates, convertWithUserRates } from "@/lib/userRates";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "THB", "VND", "MYR", "SGD", "IDR", "AED", "AUD"];

type ConvResult = { from: string; to: string; converted: number; rate: number; source: "yours" | "live" };

/** Compact currency converter — prefers the rates you entered on the budget form. */
export function CurrencyConverter() {
  const [amount, setAmount] = useState(100);
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("INR");
  const [result, setResult] = useState<ConvResult | null>(null);
  const userRates = useUserRates();
  const convert = useCurrencyConvert();

  const swap = () => { setFrom(to); setTo(from); setResult(null); convert.reset(); };

  const run = () => {
    // Use the user's orientexchange rates when both currencies are available
    const local = convertWithUserRates(amount, from, to, userRates);
    if (local) {
      setResult({ from, to, converted: local.converted, rate: local.rate, source: "yours" });
      return;
    }
    convert.mutate(
      { amount, from, to },
      { onSuccess: (d) => setResult({ ...d, source: "live" }) },
    );
  };

  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-sm font-semibold text-white mb-3">Currency Converter</p>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[100px]">
          <label className="text-[10px] text-[var(--fg-muted)] mb-1 block">Amount</label>
          <input type="number" min={0} value={amount}
            onChange={(e) => setAmount(+e.target.value)}
            className="input-dark" />
        </div>
        <div className="w-24">
          <label className="text-[10px] text-[var(--fg-muted)] mb-1 block">From</label>
          <select value={from} onChange={(e) => { setFrom(e.target.value); setResult(null); }} className="input-dark">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <motion.button whileTap={{ scale: 0.9, rotate: 180 }} transition={spring}
          onClick={swap} aria-label="Swap currencies"
          className="mb-0.5 p-2 rounded-lg border border-[var(--border)] text-[var(--fg-muted)] hover:text-white hover:border-emerald-500/40 transition-colors">
          <ArrowLeftRight className="w-4 h-4" />
        </motion.button>
        <div className="w-24">
          <label className="text-[10px] text-[var(--fg-muted)] mb-1 block">To</label>
          <select value={to} onChange={(e) => { setTo(e.target.value); setResult(null); }} className="input-dark">
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={run} disabled={convert.isPending}
          className="mb-0.5 flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60">
          {convert.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Convert"}
        </button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="mt-4 pt-4 border-t border-[var(--border)]">
          <p className="font-display text-3xl leading-tight tracking-tight text-[var(--fg)]">
            <CountUp value={result.converted} decimals={2} /> {result.to}
          </p>
          <p className="text-xs text-[var(--fg-muted)] mt-1">
            1 {result.from} = {result.rate.toFixed(4)} {result.to}
            <span className="ml-1 opacity-70">· {result.source === "yours" ? "your entered rate" : "live rate"}</span>
          </p>
        </motion.div>
      )}
      {convert.isError && (
        <p className="mt-3 text-xs text-red-400">{(convert.error as Error)?.message}</p>
      )}
    </div>
  );
}
