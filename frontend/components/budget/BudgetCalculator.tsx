"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, useFieldArray, type Control, type UseFormRegister, type UseFormWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusCircle, Trash2, Calculator, RefreshCw, ChevronDown, ChevronUp, Info, ShieldCheck, Search, ExternalLink, Calendar, Copy, GitCompareArrows, TrendingDown, Save, History, FolderOpen } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BudgetInput, BudgetResult, VisaCheckResult } from "@/lib/types";
import { formatINR, formatUSD, formatNumber, cn } from "@/lib/utils";
import { setUserRates } from "@/lib/userRates";
import { usePlans } from "@/lib/usePlans";
import { BudgetPdfButton } from "@/components/budget/BudgetPdfButton";

// ─── Route auto-formatter ────────────────────────────────────────────────────
// Turns "BLR-SGN", "BLR > SGN", "BLR to SGN", "BLR SGN" → "BLR → SGN"
function normalizeRoute(raw: string): string {
  // Replace explicit separators immediately
  let v = raw.replace(/\s*(?:->|-->|-\s*>|→|to\b)\s*/gi, " → ");
  // If two whitespace-separated words with no separator yet, insert arrow
  v = v.replace(/^([A-Z0-9]{2,4})\s+([A-Z0-9]{2,4})$/i, "$1 → $2");
  return v;
}
import { VisaBadge, VisaResultCard } from "@/components/visa/VisaCostChecker";
import { PocketMoneyCheck } from "@/components/budget/PocketMoneyCheck";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from "recharts";
import { useEffect, useRef, useState as useCountState } from "react";

// ─── schema ───────────────────────────────────────────────────────────────────

const flightSchema = z.object({
  route: z.string(),
  price_inr: z.number().min(0),
  per_person: z.boolean(),
  date: z.string().optional(),
});

const schema = z.object({
  travelers: z.number().min(1).max(50),
  exchange_rates: z.array(z.object({ currency: z.string().min(1), rate_to_inr: z.number().positive() })),
  flights: z.array(flightSchema),
  case_a_label: z.string(),
  compare_enabled: z.boolean(),
  flights_b: z.array(flightSchema),
  case_b_label: z.string(),
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
type FlightLeg = z.infer<typeof flightSchema>;
type CaseKey = "a" | "b";

// ─── helpers ──────────────────────────────────────────────────────────────────

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "THB", "VND", "MYR", "SGD", "IDR", "AED", "AUD", "INR"];
const PIE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const sumLegs = (legs: FlightLeg[] = []) =>
  legs.reduce((s, f) => s + (Number.isFinite(f.price_inr) ? f.price_inr : 0), 0);

/** "12 Sep" or "12 Sep – 19 Sep" from the legs that actually have a date. */
function dateRangeLabel(legs: FlightLeg[] = []): string {
  const dates = legs.map(f => f.date).filter((d): d is string => !!d).sort();
  if (!dates.length) return "No dates set";
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return dates[0] === dates[dates.length - 1]
    ? fmt(dates[0])
    : `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`;
}

/** Strip comparison-only fields and drop blank rows before hitting the API. */
function toBudgetInput(d: FormValues, legs: FlightLeg[]): BudgetInput {
  return {
    travelers: d.travelers,
    exchange_rates: d.exchange_rates,
    flights: legs
      .filter(f => f.route.trim() !== "" || f.price_inr > 0)
      .map(f => ({
        route: f.route.trim() || "Flight",
        price_inr: f.price_inr,
        per_person: f.per_person,
        date: f.date || "",
      })),
    accommodations: d.accommodations,
    sightseeing: d.sightseeing,
    extras: d.extras,
    pocket_money_usd: d.pocket_money_usd,
    cash_conversions: d.cash_conversions,
  };
}

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
  const [resultB, setResultB] = useState<BudgetResult | null>(null);
  const [activeCase, setActiveCase] = useState<CaseKey>("a");
  // visa results keyed by destination name
  const [visaResults, setVisaResults] = useState<Record<string, VisaCheckResult>>({});
  const [checkingVisa, setCheckingVisa] = useState<string | null>(null);
  const [expandedVisa, setExpandedVisa] = useState<string | null>(null);
  // attraction price lookup state: key = field index, value = loading bool
  const [lookingUpAttraction, setLookingUpAttraction] = useState<Record<number, boolean>>({});

  const { data: forexRates, isLoading: loadingForex } = useQuery({
    queryKey: ["forex"],
    queryFn: api.getForexRates,
    staleTime: 5 * 60 * 1000,
  });

  const { register, control, handleSubmit, setValue, watch, reset, getValues, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      travelers: 3,
      exchange_rates: [
        { currency: "USD", rate_to_inr: 97.11 },
        { currency: "MYR", rate_to_inr: 24.19 },
        { currency: "VND", rate_to_inr: 0.00386 },
      ],
      flights: [
        { route: "BLR → SGN", price_inr: 17083, per_person: true, date: "" },
        { route: "SGN → KUL", price_inr: 8295,  per_person: true, date: "" },
        { route: "KUL → BLR", price_inr: 15984, per_person: true, date: "" },
      ],
      case_a_label: "Week 1",
      compare_enabled: false,
      flights_b: [],
      case_b_label: "Week 2",
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
  const stays      = useFieldArray({ control, name: "accommodations" });
  const sight      = useFieldArray({ control, name: "sightseeing" });
  const xtra       = useFieldArray({ control, name: "extras" });
  const cashConv   = useFieldArray({ control, name: "cash_conversions" });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const a = await api.calculateBudget(toBudgetInput(data, data.flights));
      const b = data.compare_enabled
        ? await api.calculateBudget(toBudgetInput(data, data.flights_b))
        : null;
      return { a, b };
    },
    onSuccess: ({ a, b }) => {
      setResult(a);
      setResultB(b);
      setActiveCase("a");
    },
  });

  const onSubmit = (data: FormValues) => mutation.mutate(data);

  const compareEnabled = watch("compare_enabled");

  // Seed Case 2 with Case 1's routes so only prices/dates need re-entering
  const toggleCompare = useCallback(() => {
    const next = !watch("compare_enabled");
    setValue("compare_enabled", next);
    if (next && watch("flights_b").length === 0) {
      setValue("flights_b", watch("flights").map(f => ({ ...f, date: "" })));
    }
    if (!next) setResultB(null);
  }, [watch, setValue]);

  const copyRoutesFromA = useCallback(() => {
    setValue("flights_b", watch("flights").map(f => ({ ...f, date: "" })));
  }, [watch, setValue]);

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

  // Look up entry fee for a sightseeing attraction
  const handleAttractionLookup = useCallback(async (idx: number) => {
    const name = (watch(`sightseeing.${idx}.name`) ?? "").trim();
    if (!name) return;
    setLookingUpAttraction(prev => ({ ...prev, [idx]: true }));
    try {
      const res = await api.attractionPrice(name);
      if (!res.free && res.amount > 0) {
        setValue(`sightseeing.${idx}.amount`, res.amount);
        setValue(`sightseeing.${idx}.currency`, res.currency);
        // Update name to official full name if returned
        if (res.name && res.name.trim()) setValue(`sightseeing.${idx}.name`, res.name);
      } else if (res.free) {
        setValue(`sightseeing.${idx}.amount`, 0);
        setValue(`sightseeing.${idx}.currency`, "USD");
      }
    } catch {
      // silently ignore — user can still fill manually
    } finally {
      setLookingUpAttraction(prev => ({ ...prev, [idx]: false }));
    }
  }, [watch, setValue]);

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

  // Share entered rates with the Currency Converter widget on the same page
  const watchedRates = watch("exchange_rates");
  useEffect(() => {
    const map: Record<string, number> = { INR: 1 };
    watchedRates.forEach(r => {
      if (r.currency && r.rate_to_inr > 0) map[r.currency.toUpperCase()] = r.rate_to_inr;
    });
    setUserRates(map);
  }, [JSON.stringify(watchedRates)]);

  // ── Saved plans (server when logged in, localStorage otherwise) ──
  const { plans: savedPlans, save: savePlanRemote, remove: removePlanRemote, authed } = usePlans();
  const [planName, setPlanName] = useState("");

  const saveCurrentPlan = useCallback(async () => {
    await savePlanRemote(planName.trim() || new Date().toLocaleString(), getValues() as unknown as Record<string, unknown>);
    setPlanName("");
  }, [planName, getValues, savePlanRemote]);

  const loadPlan = useCallback((values: Record<string, unknown>) => {
    reset(values as unknown as FormValues);
    setResult(null);
    setResultB(null);
  }, [reset]);

  const removePlan = useCallback((id: string) => { void removePlanRemote(id); }, [removePlanRemote]);

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

            {/* Saved Plans */}
            <SectionCard title="Saved Plans">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCurrentPlan(); } }}
                  placeholder="Name this plan (e.g. SEA trip — Nov 2026)"
                  className="input-dark flex-1"
                />
                <button
                  type="button"
                  onClick={saveCurrentPlan}
                  className="flex items-center justify-center gap-1.5 text-sm font-medium rounded-lg border border-emerald-500/30 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20 px-3 py-2 transition-colors"
                >
                  <Save className="w-4 h-4" /> Save current
                </button>
              </div>

              {savedPlans.length === 0 ? (
                <p className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                  <History className="w-3.5 h-3.5" />
                  {authed
                    ? "Saved plans sync to your account — open them on any device."
                    : "Saved in this browser. "}
                  {!authed && (
                    <a href="/account" className="text-emerald-400 hover:text-emerald-300 underline">Log in to sync across devices</a>
                  )}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {savedPlans.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{p.name}</p>
                        <p className="text-[11px] text-[var(--fg-muted)]">{new Date(p.savedAt).toLocaleString()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => loadPlan(p.values)}
                        className="flex items-center gap-1 text-xs font-medium rounded-md border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 px-2 py-1 transition-colors"
                      >
                        <FolderOpen className="w-3.5 h-3.5" /> Load
                      </button>
                      <button
                        type="button"
                        onClick={() => removePlan(p.id)}
                        aria-label={`Delete ${p.name}`}
                        className="text-rose-400 hover:text-rose-300 p-1 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

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
                <a
                  href="https://www.orientexchange.in/moneychangelist"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-2 py-1 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  View live rates on Orient Exchange
                </a>
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
                      <input type="number" inputMode="decimal" step="any" className="input-dark"
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
                Check live rates at{" "}
                <a href="https://www.orientexchange.in/moneychangelist" target="_blank" rel="noopener noreferrer"
                  className="text-emerald-400/70 hover:text-emerald-400 underline underline-offset-2">
                  orientexchange.in
                </a>
                {" "}and enter them above.
              </p>
            </SectionCard>

            {/* Flights */}
            <SectionCard title="Flights (per person in INR)">
              <FlightCaseBlock
                control={control}
                register={register}
                watch={watch}
                name="flights"
                labelField="case_a_label"
                accent="emerald"
                badge="Case 1"
              />

              <div className="pt-3 mt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={toggleCompare}
                  className={cn(
                    "flex items-center gap-2 text-sm rounded-lg px-3 py-1.5 border transition-colors",
                    compareEnabled
                      ? "border-indigo-500/40 bg-indigo-600/15 text-indigo-300 hover:bg-indigo-600/25"
                      : "border-[var(--border)] text-[var(--fg-muted)] hover:text-white hover:border-white/20"
                  )}
                >
                  <GitCompareArrows className="w-4 h-4" />
                  {compareEnabled ? "Remove second week" : "Compare another week"}
                </button>
                {!compareEnabled && (
                  <p className="text-[10px] text-[var(--fg-muted)]/60 mt-2">
                    Add a second set of flight prices for different dates and see both totals side by side.
                  </p>
                )}
              </div>

              <AnimatePresence initial={false}>
                {compareEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3">
                      <FlightCaseBlock
                        control={control}
                        register={register}
                        watch={watch}
                        name="flights_b"
                        labelField="case_b_label"
                        accent="indigo"
                        badge="Case 2"
                        onCopyRoutes={copyRoutesFromA}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
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
                          <input type="number" inputMode="decimal" className="input-dark"
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
              <p className="text-xs text-[#8892b0] flex items-center gap-1 mb-2">
                <Info className="w-3 h-3" /> Type an attraction name and click
                <Search className="w-3 h-3 inline mx-0.5" /> to auto-load its entry fee.
              </p>
              <div className="space-y-2">
                {sight.fields.map((f, i) => {
                  const isLoading = !!lookingUpAttraction[i];
                  const currentName = watch(`sightseeing.${i}.name`) ?? "";
                  return (
                    <div key={f.id} className="flex gap-2 items-end flex-wrap">
                      <Field className="flex-1 min-w-[140px]">
                        <Label>Attraction</Label>
                        <div className="flex gap-1">
                          <input
                            className="input-dark flex-1"
                            placeholder="e.g. Marble Mountains"
                            {...register(`sightseeing.${i}.name`)}
                            onKeyDown={(e) => e.key === "Enter" && handleAttractionLookup(i)}
                          />
                          <button
                            type="button"
                            onClick={() => handleAttractionLookup(i)}
                            disabled={isLoading || !currentName.trim()}
                            title="Look up entry fee"
                            className="px-2 rounded-lg border border-indigo-500/30 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 disabled:opacity-40 transition-colors"
                          >
                            {isLoading
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Search className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </Field>
                      <Field className="w-32">
                        <Label>Amount</Label>
                        <input type="number" inputMode="decimal" className="input-dark"
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
                  );
                })}
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
                      <input type="number" inputMode="decimal" className="input-dark"
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
                  <input type="number" inputMode="decimal" className="input-dark"
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
                      <input type="number" inputMode="decimal" className="input-dark"
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
            {result && resultB && (
              <CaseComparison
                a={result}
                b={resultB}
                labelA={watch("case_a_label") || "Case 1"}
                labelB={watch("case_b_label") || "Case 2"}
                datesA={dateRangeLabel(watch("flights"))}
                datesB={dateRangeLabel(watch("flights_b"))}
                activeCase={activeCase}
                onSelect={setActiveCase}
              />
            )}
            <AnimatePresence>
              {result && (
                <div className="flex justify-end">
                  <BudgetPdfButton
                    result={activeCase === "b" && resultB ? resultB : result}
                    title={planName || "Trip Budget"}
                  />
                </div>
              )}
              {result && (
                <BudgetResults
                  key={activeCase}
                  result={activeCase === "b" && resultB ? resultB : result}
                />
              )}
              {result && (
                <PocketMoneyCheck
                  key={`pmc-${activeCase}`}
                  result={activeCase === "b" && resultB ? resultB : result}
                />
              )}
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
            <Row key={i} label={f.date ? `${f.route} · ${f.date}` : f.route} value={formatINR(f.amount_inr)} />
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

// ─── Flight case block (one week of flight prices + dates) ────────────────────

function FlightCaseBlock({
  control, register, watch, name, labelField, accent, badge, onCopyRoutes,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  name: "flights" | "flights_b";
  labelField: "case_a_label" | "case_b_label";
  accent: "emerald" | "indigo";
  badge: string;
  onCopyRoutes?: () => void;
}) {
  const fa = useFieldArray({ control, name });
  const legs = watch(name) ?? [];
  const subtotal = sumLegs(legs);
  const accentCls = accent === "emerald"
    ? "border-emerald-500/30 bg-emerald-600/10 text-emerald-300"
    : "border-indigo-500/30 bg-indigo-600/10 text-indigo-300";
  const linkCls = accent === "emerald"
    ? "text-emerald-400 hover:text-emerald-300"
    : "text-indigo-400 hover:text-indigo-300";

  return (
    <div className="rounded-xl border border-[var(--border)] p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider rounded-md border px-2 py-0.5", accentCls)}>
          {badge}
        </span>
        <input
          className="input-dark h-8 w-32 text-xs"
          placeholder="Week 1"
          {...register(labelField)}
        />
        <span className="text-xs text-[var(--fg-muted)] flex items-center gap-1">
          <Calendar className="w-3 h-3" /> {dateRangeLabel(legs)}
        </span>
        <span className="ml-auto text-xs text-white font-semibold">{formatINR(subtotal)}</span>
      </div>

      <div className="space-y-2">
        {fa.fields.map((f, i) => (
          <div key={f.id} className="flex gap-2 items-end flex-wrap">
            <Field className="flex-1 min-w-[130px]">
              <Label>Route</Label>
              <input
                className="input-dark"
                placeholder="BLR → SGN"
                {...register(`${name}.${i}.route` as const)}
                onChange={(e) => {
                  e.target.value = normalizeRoute(e.target.value);
                  register(`${name}.${i}.route` as const).onChange(e);
                }}
              />
            </Field>
            <Field className="w-40">
              <Label>Travel date</Label>
              <input type="date" className="input-dark" {...register(`${name}.${i}.date` as const)} />
            </Field>
            <Field className="w-32">
              <Label>Price (₹)</Label>
              <input type="number" inputMode="decimal" className="input-dark"
                {...register(`${name}.${i}.price_inr` as const, { valueAsNumber: true })} />
            </Field>
            <button type="button" onClick={() => fa.remove(i)} className="mb-0.5 text-red-400/60 hover:text-red-400">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        {fa.fields.length === 0 && (
          <p className="text-xs text-[var(--fg-muted)]/70 py-2">No flights added yet.</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button type="button" onClick={() => fa.append({ route: "", price_inr: 0, per_person: true, date: "" })}
          className={cn("flex items-center gap-1 text-sm", linkCls)}>
          <PlusCircle className="w-4 h-4" /> Add flight
        </button>
        {onCopyRoutes && (
          <button type="button" onClick={onCopyRoutes}
            className="flex items-center gap-1 text-sm text-[var(--fg-muted)] hover:text-white">
            <Copy className="w-3.5 h-3.5" /> Copy routes from Case 1
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Case comparison card ─────────────────────────────────────────────────────

function CaseComparison({
  a, b, labelA, labelB, datesA, datesB, activeCase, onSelect,
}: {
  a: BudgetResult;
  b: BudgetResult;
  labelA: string;
  labelB: string;
  datesA: string;
  datesB: string;
  activeCase: CaseKey;
  onSelect: (c: CaseKey) => void;
}) {
  const diff = b.grand_total.inr - a.grand_total.inr;
  const cheaper: CaseKey | null = diff === 0 ? null : diff > 0 ? "a" : "b";

  const tile = (key: CaseKey, label: string, dates: string, res: BudgetResult) => (
    <button
      type="button"
      onClick={() => onSelect(key)}
      className={cn(
        "flex-1 text-left rounded-xl border p-3 transition-colors",
        activeCase === key
          ? "border-emerald-500/50 bg-emerald-600/10"
          : "border-[var(--border)] hover:border-white/20"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-semibold text-white truncate">{label}</span>
        {cheaper === key && (
          <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-0.5 shrink-0">
            <TrendingDown className="w-3 h-3" /> Cheaper
          </span>
        )}
      </div>
      <p className="text-[10px] text-[var(--fg-muted)] mb-2 flex items-center gap-1">
        <Calendar className="w-2.5 h-2.5" /> {dates}
      </p>
      <p className="text-lg font-bold text-white">{formatINR(res.grand_total.inr)}</p>
      <p className="text-[10px] text-[var(--fg-muted)] mt-0.5">
        Flights {formatINR(res.fixed_costs.flights.total_inr)}
      </p>
    </button>
  );

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <p className="text-sm font-medium text-white flex items-center gap-2">
        <GitCompareArrows className="w-4 h-4 text-indigo-400" /> Compare Totals
      </p>
      <div className="flex gap-2">
        {tile("a", labelA, datesA, a)}
        {tile("b", labelB, datesB, b)}
      </div>
      <p className="text-xs text-center text-[var(--fg-muted)]">
        {cheaper === null ? (
          <>Both weeks cost the same.</>
        ) : (
          <>
            <span className="text-emerald-400 font-semibold">
              {cheaper === "a" ? labelA : labelB}
            </span>{" "}
            saves{" "}
            <span className="text-white font-semibold">{formatINR(Math.abs(diff))}</span>{" "}
            per person
          </>
        )}
      </p>
      <p className="text-[10px] text-center text-[var(--fg-muted)]/60">
        Tap a case to see its full breakdown below.
      </p>
    </div>
  );
}

