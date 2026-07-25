"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusCircle, Trash2, Calculator, RefreshCw, ChevronDown, ChevronUp, Info, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BudgetInput, BudgetResult, VisaCheckResult } from "@/lib/types";
import { formatINR, formatUSD, formatNumber, cn } from "@/lib/utils";
import { VisaBadge, VisaResultCard } from "@/components/visa/VisaCostChecker";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import { useEffect, useRef, useState as useCountState } from "react";

// ─── schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  travelers: z.number().min(1).max(50),
  exchange_rates: z.array(z.object({ currency: z.string().min(1), rate_to_inr: z.number().positive() })),
  flights: z.array(z.object({ route: z.string().min(1), price_inr: z.number().min(0), per_person: z.boolean() })),
  accommodations: z.array(z.object({
    destination: z.string().min(1),
    total_cost_inr: z.number().min(0),
    split_type: z.enum(["individual", "group"]),
  })),
  sightseeing: z.array(z.object({ name: z.string().min(1), destination: z.string(), amount: z.number().min(0), currency: z.string() })),
  extras: z.array(z.object({ name: z.string().min(1), destination: z.string(), amount: z.number().min(0), currency: z.string() })),
  pocket_money_usd: z.number().min(0),
  cash_conversions: z.array(z.object({ currency: z.string().min(1), amount_inr: z.number().min(0) })),
});

type FormValues = z.infer<typeof schema>;

// ─── helpers ──────────────────────────────────────────────────────────────────

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "THB", "VND", "MYR", "SGD", "IDR", "AED", "AUD", "INR"];
const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

function SectionCard({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(() => {
    // On mobile (< 768px), start all sections closed to reduce scroll
    if (typeof window !== "undefined" && window.innerWidth < 768) return false;
    return defaultOpen;
  });
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <span className="font-semibold text-white">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-[var(--fg-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--fg-muted)]" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-3 border-t border-[var(--border)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-[var(--fg-muted)] mb-1">{children}</label>;
}

function Field({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}

// ─── main component ───────────────────────────────────────────────────────────

export function BudgetCalculator() {
  const [result, setResult] = useState<BudgetResult | null>(null);
  // visa results keyed by destination name
  const [visaResults, setVisaResults] = useState<Record<string, VisaCheckResult>>({});
  const [checkingVisa, setCheckingVisa] = useState<string | null>(null);
  const [expandedVisa, setExpandedVisa] = useState<string | null>(null);

  const { data: forexRates, isLoading: loadingForex } = useQuery({
    queryKey: ["forex"],
    queryFn: api.getForexRates,
    staleTime: 5 * 60 * 1000,
  });

  const { register, control, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      travelers: 3,
      exchange_rates: [
        { currency: "USD", rate_to_inr: 97.11 },
        { currency: "MYR", rate_to_inr: 24.19 },
        { currency: "VND", rate_to_inr: 0.00386 },
      ],
      flights: [
        { route: "BLR → SGN", price_inr: 17083, per_person: true },
        { route: "SGN → KUL", price_inr: 8295,  per_person: true },
        { route: "KUL → BLR", price_inr: 15984, per_person: true },
      ],
      accommodations: [
        { destination: "Da Nang",      total_cost_inr: 7241,  split_type: "group" },
        { destination: "HCMC",         total_cost_inr: 12194, split_type: "group" },
        { destination: "Johor Bahru",  total_cost_inr: 8415,  split_type: "individual" },
        { destination: "Kuala Lumpur", total_cost_inr: 3463,  split_type: "individual" },
      ],
      sightseeing: [
        { name: "Vietnam Attractions", destination: "Vietnam", amount: 2695000, currency: "VND" },
        { name: "Malaysia Attractions",destination: "Malaysia",amount: 251,     currency: "MYR" },
      ],
      extras: [
        { name: "SIM Card", destination: "Vietnam", amount: 185000, currency: "VND" },
      ],
      pocket_money_usd: 750,
      cash_conversions: [
        { currency: "VND", amount_inr: 6000 },
        { currency: "MYR", amount_inr: 9000 },
      ],
    },
  });

  const exRates    = useFieldArray({ control, name: "exchange_rates" });
  const flights    = useFieldArray({ control, name: "flights" });
  const stays      = useFieldArray({ control, name: "accommodations" });
  const sight      = useFieldArray({ control, name: "sightseeing" });
  const xtra       = useFieldArray({ control, name: "extras" });
  const cashConv   = useFieldArray({ control, name: "cash_conversions" });

  const mutation = useMutation({
    mutationFn: (data: BudgetInput) => api.calculateBudget(data),
    onSuccess: (data) => setResult(data),
  });

  const onSubmit = (data: FormValues) => mutation.mutate(data as BudgetInput);

  // Add visa cost to extras list
  const addVisaToBudget = useCallback((name: string, amount: number, currency: string) => {
    xtra.append({ name, destination: "", amount, currency });
  }, [xtra]);

  // Check visa for a destination
  const handleCheckVisa = useCallback(async (destination: string) => {
    if (!destination.trim()) return;
    setCheckingVisa(destination);
    try {
      const res = await api.checkVisa({ country: destination });
      setVisaResults(prev => ({ ...prev, [destination]: res }));
      setExpandedVisa(destination);
    } finally {
      setCheckingVisa(null);
    }
  }, []);

  // Fill live forex rates from orientexchange.in (via /api/forex)
  // forexRates["USD"] = 96.64 already means "1 USD = ₹96.64" — use directly
  const fillLiveRates = useCallback(() => {
    if (!forexRates) return;
    const fields = watch("exchange_rates");
    fields.forEach((f, i) => {
      const live = forexRates[f.currency];
      if (live) setValue(`exchange_rates.${i}.rate_to_inr`, live);
    });
  }, [forexRates, watch, setValue]);

  const currencies = watch("exchange_rates").map(r => r.currency);
  const allCurrencies = [...new Set([...COMMON_CURRENCIES, ...currencies])];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-display text-4xl md:text-5xl leading-[1] tracking-tight text-[var(--fg)] mb-2">Trip Budget Calculator</h1>
        <p className="text-[var(--fg-muted)]">Multi-destination · Per-person share · Cash conversion breakdown</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          {/* ── Left column: inputs ── */}
          <div className="space-y-4">

            {/* Travelers */}
            <SectionCard title="Travelers">
              <Field>
                <Label>Number of travelers</Label>
                <input type="number" min={1} max={50} className="input-dark w-32"
                  {...register("travelers", { valueAsNumber: true })} />
              </Field>
            </SectionCard>

            {/* Exchange Rates */}
            <SectionCard title="Exchange Rates (→ INR)">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-[var(--fg-muted)]">
                  Enter how many INR = 1 unit of each currency
                </p>
                <button type="button" onClick={fillLiveRates} disabled={loadingForex}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-2 py-1 transition-colors">
                  <RefreshCw className={cn("w-3 h-3", loadingForex && "animate-spin")} />
                  {loadingForex ? "Fetching…" : "Fill from Orient Exchange"}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {exRates.fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-end">
                    <Field className="flex-1">
                      <Label>Currency</Label>
                      <select className="input-dark" {...register(`exchange_rates.${i}.currency`)}>
                        {allCurrencies.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field className="flex-1">
                      <Label>Rate to INR</Label>
                      <input type="number" step="any" className="input-dark"
                        {...register(`exchange_rates.${i}.rate_to_inr`, { valueAsNumber: true })} />
                    </Field>
                    <button type="button" onClick={() => exRates.remove(i)}
                      className="mb-0.5 text-red-400/60 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => exRates.append({ currency: "SGD", rate_to_inr: 62 })}
                className="mt-2 flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300">
                <PlusCircle className="w-4 h-4" /> Add currency
              </button>
              <p className="text-[10px] text-[var(--fg-muted)]/60 mt-2">
                Rates sourced from{" "}
                <a href="https://www.orientexchange.in" target="_blank" rel="noopener noreferrer"
                  className="text-emerald-400/70 hover:text-emerald-400 underline underline-offset-2">
                  orientexchange.in
                </a>
                {" "}· updated on page load
              </p>
            </SectionCard>

            {/* Flights */}
            <SectionCard title="Flights (per person in INR)">
              <div className="space-y-2">
                {flights.fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-end">
                    <Field className="flex-1">
                      <Label>Route</Label>
                      <input className="input-dark" placeholder="BLR → SGN" {...register(`flights.${i}.route`)} />
                    </Field>
                    <Field className="w-36">
                      <Label>Price (₹)</Label>
                      <input type="number" className="input-dark"
                        {...register(`flights.${i}.price_inr`, { valueAsNumber: true })} />
                    </Field>
                    <button type="button" onClick={() => flights.remove(i)} className="mb-0.5 text-red-400/60 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => flights.append({ route: "", price_inr: 0, per_person: true })}
                className="mt-2 flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300">
                <PlusCircle className="w-4 h-4" /> Add flight
              </button>
            </SectionCard>

            {/* Accommodation */}
            <SectionCard title="Accommodation">
              <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1 mb-2">
                <Info className="w-3 h-3" /> Total booking price; choose split type
              </p>
              <div className="space-y-2">
                {stays.fields.map((f, i) => {
                  const destVal = watch(`accommodations.${i}.destination`);
                  const visaRes = visaResults[destVal];
                  return (
                    <div key={f.id} className="space-y-2">
                      <div className="flex gap-2 items-end flex-wrap">
                        <Field className="flex-1 min-w-[120px]">
                          <Label>Destination</Label>
                          <input className="input-dark" {...register(`accommodations.${i}.destination`)} />
                        </Field>
                        <Field className="w-36">
                          <Label>Total Cost (₹)</Label>
                          <input type="number" className="input-dark"
                            {...register(`accommodations.${i}.total_cost_inr`, { valueAsNumber: true })} />
                        </Field>
                        <Field className="w-36">
                          <Label>Split</Label>
                          <select className="input-dark" {...register(`accommodations.${i}.split_type`)}>
                            <option value="group">Split by group</option>
                            <option value="individual">Individual</option>
                          </select>
                        </Field>
                        <button type="button" onClick={() => stays.remove(i)} className="mb-0.5 text-red-400/60 hover:text-red-400">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Visa check row */}
                      {destVal.trim().length > 1 && (
                        <div className="flex items-center gap-2 flex-wrap pl-1">
                          <button
                            type="button"
                            onClick={() => expandedVisa === destVal
                              ? setExpandedVisa(null)
                              : (visaRes ? setExpandedVisa(destVal) : handleCheckVisa(destVal))
                            }
                            disabled={checkingVisa === destVal}
                            className="flex items-center gap-1.5 text-xs border border-emerald-500/30 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-300 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-60"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {checkingVisa === destVal ? "Checking…" : visaRes ? "Visa checked" : "Check Visa"}
                          </button>
                          {visaRes && (
                            <VisaBadge type={visaRes.visa_type} small />
                          )}
                          {visaRes && !visaRes.is_free && visaRes.cost_inr_approx > 0 && (
                            <span className="text-xs text-amber-300">
                              ~{formatINR(visaRes.cost_inr_approx)} per person
                            </span>
                          )}
                          {visaRes?.is_free && (
                            <span className="text-xs text-emerald-400">No visa cost ✓</span>
                          )}
                        </div>
                      )}

                      {/* Expanded visa detail */}
                      <AnimatePresence>
                        {expandedVisa === destVal && visaRes && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <VisaResultCard
                              result={visaRes}
                              onAddToBudget={addVisaToBudget}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => stays.append({ destination: "", total_cost_inr: 0, split_type: "group" })}
                className="mt-2 flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300">
                <PlusCircle className="w-4 h-4" /> Add accommodation
              </button>
            </SectionCard>

            {/* Sightseeing */}
            <SectionCard title="Sightseeing & Attractions">
              <div className="space-y-2">
                {sight.fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-end flex-wrap">
                    <Field className="flex-1 min-w-[120px]">
                      <Label>Name</Label>
                      <input className="input-dark" {...register(`sightseeing.${i}.name`)} />
                    </Field>
                    <Field className="w-32">
                      <Label>Amount</Label>
                      <input type="number" className="input-dark"
                        {...register(`sightseeing.${i}.amount`, { valueAsNumber: true })} />
                    </Field>
                    <Field className="w-28">
                      <Label>Currency</Label>
                      <select className="input-dark" {...register(`sightseeing.${i}.currency`)}>
                        {allCurrencies.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <button type="button" onClick={() => sight.remove(i)} className="mb-0.5 text-red-400/60 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => sight.append({ name: "", destination: "", amount: 0, currency: "USD" })}
                className="mt-2 flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300">
                <PlusCircle className="w-4 h-4" /> Add item
              </button>
            </SectionCard>

            {/* Extras */}
            <SectionCard title="Extras (SIM, Visa, Insurance…)" defaultOpen={false}>
              <div className="space-y-2">
                {xtra.fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-end flex-wrap">
                    <Field className="flex-1 min-w-[120px]">
                      <Label>Name</Label>
                      <input className="input-dark" {...register(`extras.${i}.name`)} />
                    </Field>
                    <Field className="w-32">
                      <Label>Amount</Label>
                      <input type="number" className="input-dark"
                        {...register(`extras.${i}.amount`, { valueAsNumber: true })} />
                    </Field>
                    <Field className="w-28">
                      <Label>Currency</Label>
                      <select className="input-dark" {...register(`extras.${i}.currency`)}>
                        {allCurrencies.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <button type="button" onClick={() => xtra.remove(i)} className="mb-0.5 text-red-400/60 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => xtra.append({ name: "", destination: "", amount: 0, currency: "USD" })}
                className="mt-2 flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300">
                <PlusCircle className="w-4 h-4" /> Add extra
              </button>
            </SectionCard>

            {/* Cash Setup */}
            <SectionCard title="Pocket Money & Cash Setup">
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <Field>
                  <Label>Total pocket money (USD)</Label>
                  <input type="number" className="input-dark"
                    {...register("pocket_money_usd", { valueAsNumber: true })} />
                </Field>
              </div>
              <p className="text-xs text-[var(--fg-muted)] mb-2">
                Allocate some of your pocket money as local cash:
              </p>
              <div className="space-y-2">
                {cashConv.fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-end">
                    <Field className="w-28">
                      <Label>Currency</Label>
                      <select className="input-dark" {...register(`cash_conversions.${i}.currency`)}>
                        {allCurrencies.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </Field>
                    <Field className="flex-1">
                      <Label>INR to convert</Label>
                      <input type="number" className="input-dark"
                        {...register(`cash_conversions.${i}.amount_inr`, { valueAsNumber: true })} />
                    </Field>
                    <button type="button" onClick={() => cashConv.remove(i)} className="mb-0.5 text-red-400/60 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => cashConv.append({ currency: "THB", amount_inr: 0 })}
                className="mt-2 flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300">
                <PlusCircle className="w-4 h-4" /> Add conversion
              </button>
            </SectionCard>

            <button type="submit" disabled={mutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
              <Calculator className="w-5 h-5" />
              {mutation.isPending ? "Calculating…" : "Calculate My Share"}
            </button>

            {mutation.isError && (
              <p className="text-red-400 text-sm text-center">
                {mutation.error?.message ?? "Something went wrong. Is the backend running?"}
              </p>
            )}
          </div>

          {/* ── Right column: results ── */}
          <div className="space-y-4">
            <AnimatePresence>
              {result && <BudgetResults result={result} />}
              {!result && (
                <div className="glass rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[300px] gap-4">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="32" cy="32" r="30" fill="#17171b" stroke="#1f1f24" strokeWidth="1.5"/>
                    <rect x="18" y="20" width="28" height="22" rx="3" fill="#111114" stroke="#1f1f24" strokeWidth="1"/>
                    <line x1="22" y1="28" x2="42" y2="28" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="22" y1="33" x2="36" y2="33" stroke="#a1a1aa" strokeWidth="1" strokeLinecap="round"/>
                    <line x1="22" y1="37" x2="38" y2="37" stroke="#a1a1aa" strokeWidth="1" strokeLinecap="round"/>
                    <circle cx="44" cy="42" r="9" fill="#17171b" stroke="#10b981" strokeWidth="1.5"/>
                    <text x="44" y="46" textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="bold">₹</text>
                  </svg>
                  <div>
                    <p className="text-white font-medium mb-1">Your budget breakdown</p>
                    <p className="text-[var(--fg-muted)] text-sm">Fill in your trip details and click<br /><span className="text-white">&quot;Calculate My Share&quot;</span></p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </form>
    </div>
  );
}

// ─── Results panel ────────────────────────────────────────────────────────────

function BudgetResults({ result }: { result: BudgetResult }) {
  const fc = result.fixed_costs;
  const cc = result.cash_conversion;
  const gt = result.grand_total;

  // Animated counter for grand total
  const [displayedINR, setDisplayedINR] = useCountState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const target = gt.inr;
    const duration = 1000;
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedINR(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [gt.inr]);

  const chartData = [
    { name: "Flights",      value: fc.flights.total_inr },
    { name: "Stays",        value: fc.stays.total_inr },
    { name: "Sightseeing",  value: fc.sightseeing.total_inr },
    { name: "Extras",       value: fc.extras.total_inr },
    { name: "Pocket $",     value: cc.pocket_money_inr },
  ].filter(d => d.value > 0);

  const pieData = chartData;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Grand total — animated counter */}
      <div className="glass rounded-2xl p-6 border border-emerald-500/30">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)] mb-1">Grand Total (Your Share)</p>
        <p className="text-4xl font-bold gradient-text">{formatINR(displayedINR)}</p>
        <p className="text-[var(--fg-muted)] text-sm mt-1">≈ {formatUSD(gt.usd)}</p>
      </div>

      {/* Bar chart — horizontal breakdown */}
      <div className="glass rounded-2xl p-4">
        <p className="text-sm font-medium text-white mb-3">Breakdown</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f24" horizontal={false} />
              <XAxis type="number" tick={false} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "var(--fg-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
              <Tooltip
                formatter={(v) => formatINR(Number(v))}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)" }}
                cursor={{ fill: "rgba(99,102,241,0.08)" }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
                <LabelList dataKey="value" position="right" formatter={(v: unknown) => formatINR(Number(v))} style={{ fill: "var(--fg)", fontSize: 10 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie chart */}
      <div className="glass rounded-2xl p-4">
        <p className="text-sm font-medium text-white mb-3">Share</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={60} paddingAngle={2}>
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip
                formatter={(v) => formatINR(Number(v))}
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-2 justify-center mt-2">
          {pieData.map((d, i) => (
            <span key={d.name} className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
              <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
              {d.name}
            </span>
          ))}
        </div>
      </div>

      {/* Fixed costs */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-white">1. Fixed Costs</p>
        <ResultSection label="Flights" total={fc.flights.total_inr}>
          {fc.flights.items.map((f, i) => (
            <Row key={i} label={f.route} value={formatINR(f.amount_inr)} />
          ))}
        </ResultSection>
        <ResultSection label="Stays" total={fc.stays.total_inr}>
          {fc.stays.items.map((s, i) => (
            <Row key={i} label={`${s.destination} (${s.split})`} value={formatINR(s.per_person_inr)} />
          ))}
        </ResultSection>
        {fc.sightseeing.total_inr > 0 && (
          <ResultSection label="Sightseeing" total={fc.sightseeing.total_inr}>
            {fc.sightseeing.items.map((s, i) => (
              <Row key={i} label={`${s.name} (${s.original})`} value={formatINR(s.amount_inr)} />
            ))}
          </ResultSection>
        )}
        {fc.extras.total_inr > 0 && (
          <ResultSection label="Extras" total={fc.extras.total_inr}>
            {fc.extras.items.map((e, i) => (
              <Row key={i} label={`${e.name} (${e.original})`} value={formatINR(e.amount_inr)} />
            ))}
          </ResultSection>
        )}
        <div className="border-t border-[var(--border)] pt-2 flex justify-between text-white font-semibold">
          <span>Total Fixed</span>
          <span>{formatINR(fc.total_inr)}</span>
        </div>
      </div>

      {/* Cash conversion */}
      <div className="glass rounded-2xl p-4 space-y-2">
        <p className="text-sm font-medium text-white">2. Cash Conversion</p>
        <Row label="Pocket money" value={`$${formatNumber(cc.pocket_money_usd)} = ${formatINR(cc.pocket_money_inr)}`} />
        {cc.allocations.map((a, i) => (
          <Row key={i} label={`→ ${a.display}`} value={formatINR(a.inr_spent)} sub />
        ))}
        <Row label="Remaining on USD/Forex card" value={`${formatUSD(cc.usd_forex_remaining_usd)} (${formatINR(cc.usd_forex_remaining_inr)})`} />
      </div>
    </motion.div>
  );
}

function ResultSection({ label, total, children }: { label: string; total: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/5 p-3 space-y-1">
      <div className="flex justify-between text-xs font-medium text-[var(--fg-muted)] mb-1">
        <span>{label}</span>
        <span className="text-white">{formatINR(total)}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: boolean }) {
  return (
    <div className={cn("flex justify-between text-xs", sub ? "pl-3 text-[var(--fg-muted)]" : "text-[var(--fg-muted)]")}>
      <span>{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
