"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, useFieldArray, type Control, type UseFormRegister, type UseFormWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PlusCircle, Trash2, Calculator, RefreshCw, ChevronDown, ChevronUp, Info, ShieldCheck, Search, ExternalLink, Calendar, Copy, GitCompareArrows, TrendingDown, Save, History, FolderOpen, Plane, BedDouble, Ticket, Receipt, Wallet, Banknote, TriangleAlert, CalendarDays, Target, Users, ArrowRight, type LucideIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BudgetInput, BudgetResult, BudgetTarget, Settlement, VisaCheckResult } from "@/lib/types";
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
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine } from "recharts";
import { useEffect, useRef, useState as useCountState } from "react";

// ─── schema ───────────────────────────────────────────────────────────────────

const flightSchema = z.object({
  route: z.string(),
  price_inr: z.number().min(0),
  per_person: z.boolean(),
  date: z.string().optional(),
  paid_by: z.string().optional(),
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
    paid_by: z.string().optional(),
  })),
  sightseeing: z.array(z.object({ name: z.string().min(1), destination: z.string(), amount: z.number().min(0), currency: z.string(), paid_by: z.string().optional() })),
  extras: z.array(z.object({ name: z.string().min(1), destination: z.string(), amount: z.number().min(0), currency: z.string(), paid_by: z.string().optional() })),
  pocket_money_usd: z.number().min(0),
  cash_conversions: z.array(z.object({ currency: z.string().min(1), amount_inr: z.number().min(0) })),
  // Trip length: a date range, or a night count when the dates aren't fixed yet.
  start_date: z.string(),
  end_date: z.string(),
  nights: z.number().min(0).max(365),
  budget_target_inr: z.number().min(0),
  // Wrapped in objects because useFieldArray can't track bare strings.
  party: z.array(z.object({ name: z.string() })),
});

type FormValues = z.infer<typeof schema>;
type FlightLeg = z.infer<typeof flightSchema>;
type CaseKey = "a" | "b";

// ─── helpers ──────────────────────────────────────────────────────────────────

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "THB", "VND", "MYR", "SGD", "IDR", "AED", "AUD", "INR"];
// Per-currency colours for the cash-conversion strip (category colours are fixed
// per slice in `budgetSlices`, so the two palettes stay independent).
const CASH_COLORS = ["#22d3ee", "#a3e635", "#fbbf24", "#f472b6", "#818cf8"];

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

/** Nights between two ISO dates, or 0 if the range makes no sense. */
function nightsBetween(start?: string, end?: string): number {
  if (!start || !end) return 0;
  const from = Date.parse(`${start}T00:00:00`);
  const to = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return Math.round((to - from) / 86_400_000);
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
        paid_by: f.paid_by || "",
      })),
    accommodations: d.accommodations,
    sightseeing: d.sightseeing,
    extras: d.extras,
    pocket_money_usd: d.pocket_money_usd,
    cash_conversions: d.cash_conversions,
    start_date: d.start_date || "",
    end_date: d.end_date || "",
    nights: d.nights || 0,
    budget_target_inr: d.budget_target_inr || 0,
    party: d.party.map(p => p.name.trim()).filter(Boolean),
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

/**
 * Who fronted this bill. Absent from the DOM entirely outside group mode, so solo
 * planning stays as uncluttered as it was.
 */
function PaidByField({ members, ...select }: { members: string[] } & React.ComponentProps<"select">) {
  if (members.length < 2) return null;
  return (
    <Field className="w-36">
      <Label>Paid by</Label>
      <select className="input-dark" {...select}>
        <option value="">Each their own</option>
        {members.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </Field>
  );
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
      start_date: "",
      end_date: "",
      nights: 0,
      budget_target_inr: 0,
      party: [],
    },
  });

  const exRates    = useFieldArray({ control, name: "exchange_rates" });
  const stays      = useFieldArray({ control, name: "accommodations" });
  const sight      = useFieldArray({ control, name: "sightseeing" });
  const xtra       = useFieldArray({ control, name: "extras" });
  const cashConv   = useFieldArray({ control, name: "cash_conversions" });
  const party      = useFieldArray({ control, name: "party" });

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

  // ── Trip length ──
  const startDate = watch("start_date");
  const endDate = watch("end_date");
  const datedNights = nightsBetween(startDate, endDate);
  // The dates win when they form a real range; the manual count covers "we know
  // it's a week, we haven't booked yet".
  const effectiveNights = datedNights || watch("nights") || 0;

  // The flight legs usually already say when the trip starts and ends.
  const flightDates = watch("flights").map(f => f.date).filter((d): d is string => !!d).sort();
  const useFlightDates = useCallback(() => {
    const dates = watch("flights").map(f => f.date).filter((d): d is string => !!d).sort();
    if (dates.length < 2) return;
    setValue("start_date", dates[0]);
    setValue("end_date", dates[dates.length - 1]);
  }, [watch, setValue]);

  // ── Group mode ──
  const partyNames = watch("party").map(p => p.name.trim()).filter(Boolean);
  const groupMode = partyNames.length >= 2;
  const travelers = watch("travelers");
  const partyMismatch = partyNames.length > 0 && partyNames.length !== travelers;

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

            {/* Trip length & target */}
            <SectionCard title="Trip Length & Target">
              <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1 mb-2">
                <Info className="w-3 h-3" /> Tells you what the trip costs per day, not just in total
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                <Field>
                  <Label>Start date</Label>
                  <input type="date" className="input-dark" {...register("start_date")} />
                </Field>
                <Field>
                  <Label>End date</Label>
                  <input type="date" className="input-dark" {...register("end_date")} />
                </Field>
              </div>

              {flightDates.length >= 2 && (
                <button type="button" onClick={useFlightDates}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                  <Calendar className="w-3 h-3" /> Use your flight dates ({dateRangeLabel(watch("flights"))})
                </button>
              )}

              <div className="grid sm:grid-cols-2 gap-2 pt-1">
                <Field>
                  <Label>Nights</Label>
                  {datedNights > 0 ? (
                    <div className="input-dark flex items-center text-[var(--fg-muted)]">
                      {datedNights} <span className="ml-1 text-[10px]">from dates</span>
                    </div>
                  ) : (
                    <input type="number" min={0} max={365} className="input-dark"
                      {...register("nights", { valueAsNumber: true })} />
                  )}
                </Field>
                <Field>
                  <Label>Budget target (₹, optional)</Label>
                  <input type="number" inputMode="decimal" min={0} className="input-dark"
                    placeholder="e.g. 120000"
                    {...register("budget_target_inr", { valueAsNumber: true })} />
                </Field>
              </div>

              <p className="text-[10px] text-[var(--fg-muted)]/60">
                {effectiveNights > 0
                  ? `${effectiveNights} night${effectiveNights === 1 ? "" : "s"} · ${effectiveNights + 1} days of spending.`
                  : "Add dates or a night count to unlock per-day figures and the burn-down chart."}
              </p>
            </SectionCard>

            {/* Group trip */}
            <SectionCard title="Group Trip & Settle-up" defaultOpen={false}>
              <p className="text-xs text-[var(--fg-muted)] flex items-center gap-1 mb-2">
                <Info className="w-3 h-3" /> Name everyone, then mark who paid each bill — we&apos;ll work out who owes whom
              </p>
              <div className="space-y-2">
                {party.fields.map((f, i) => (
                  <div key={f.id} className="flex gap-2 items-end">
                    <Field className="flex-1">
                      <Label>{i === 0 ? "You" : `Traveller ${i + 1}`}</Label>
                      <input className="input-dark" placeholder="Name or @handle"
                        {...register(`party.${i}.name`)} />
                    </Field>
                    <button type="button" onClick={() => party.remove(i)} aria-label="Remove traveller"
                      className="mb-0.5 text-red-400/60 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => party.append({ name: "" })}
                className="mt-2 flex items-center gap-1 text-emerald-400 text-sm hover:text-emerald-300">
                <PlusCircle className="w-4 h-4" /> Add traveller
              </button>

              {partyMismatch && (
                <p className="flex items-start gap-1.5 text-[11px] text-amber-300 mt-2">
                  <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
                  You&apos;ve named {partyNames.length} {partyNames.length === 1 ? "person" : "people"} but
                  travellers is set to {travelers}.
                  <button type="button" onClick={() => setValue("travelers", partyNames.length)}
                    className="underline hover:text-amber-200">
                    Set it to {partyNames.length}
                  </button>
                </p>
              )}
              {!groupMode && party.fields.length > 0 && (
                <p className="text-[10px] text-[var(--fg-muted)]/60 mt-2">
                  Add a second name to turn on the settle-up ledger.
                </p>
              )}
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
                members={partyNames}
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
                        members={partyNames}
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
                        <PaidByField members={partyNames} {...register(`accommodations.${i}.paid_by`)} />
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
                      <PaidByField members={partyNames} {...register(`sightseeing.${i}.paid_by`)} />
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
                    <PaidByField members={partyNames} {...register(`extras.${i}.paid_by`)} />
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

interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
  Icon: LucideIcon;
}

/**
 * Slices that add up to exactly the grand total.
 * Sightseeing and on-arrival extras are spent *out of* pocket money, so they're
 * carved out of it rather than stacked on top — otherwise the chart totals more
 * than the money you actually need.
 */
function budgetSlices(result: BudgetResult): Slice[] {
  const fc = result.fixed_costs;
  const cc = result.cash_conversion;
  const prepaidExtras = Math.max(fc.prepaid_total_inr - fc.flights.total_inr - fc.stays.total_inr, 0);
  const onArrivalExtras = Math.max(fc.on_ground_total_inr - fc.sightseeing.total_inr, 0);

  return ([
    { key: "flights",    label: "Flights",           value: fc.flights.total_inr,           color: "#6366f1", Icon: Plane },
    { key: "stays",      label: "Stays",             value: fc.stays.total_inr,             color: "#10b981", Icon: BedDouble },
    { key: "prepaid_x",  label: "Extras (prepaid)",  value: prepaidExtras,                  color: "#8b5cf6", Icon: Receipt },
    { key: "sights",     label: "Sightseeing",       value: fc.sightseeing.total_inr,       color: "#f59e0b", Icon: Ticket },
    { key: "arrival_x",  label: "Extras on arrival", value: onArrivalExtras,                color: "#f97316", Icon: Banknote },
    { key: "free",       label: "Free spending",     value: Math.max(cc.free_spend_inr, 0), color: "#ec4899", Icon: Wallet },
  ] as Slice[]).filter(s => s.value > 0);
}

const pct = (value: number, total: number) => (total > 0 ? (value / total) * 100 : 0);
const pctLabel = (value: number, total: number) => `${Math.round(pct(value, total))}%`;

/** One rounded bar split into proportional colour segments, with a legend. */
function SplitStrip({ segments, thick }: { segments: { label: string; value: number; color: string }[]; thick?: boolean }) {
  const shown = segments.filter(s => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return null;

  return (
    <div className="space-y-2">
      <div className={cn("flex w-full overflow-hidden rounded-full bg-white/5", thick ? "h-3" : "h-2")}>
        {shown.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ width: 0 }}
            animate={{ width: `${pct(s.value, total)}%` }}
            transition={{ duration: 0.6, delay: i * 0.07, ease: "easeOut" }}
            style={{ background: s.color }}
            title={`${s.label}: ${formatINR(s.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {shown.map(s => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-[var(--fg-muted)]">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
            {s.label}
            <span className="text-white font-medium">{pctLabel(s.value, total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Meter({ value, total, color, delay = 0 }: { value: number; total: number; color: string; delay?: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(pct(value, total), 100)}%` }}
        transition={{ duration: 0.6, delay, ease: "easeOut" }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}

/** Short money for chart axes, where ₹1,20,000 doesn't fit. */
function compactINR(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000) return `₹${(value / 100_000).toFixed(abs >= 1_000_000 ? 0 : 1)}L`;
  if (abs >= 1_000) return `₹${Math.round(value / 1_000)}k`;
  return `₹${Math.round(value)}`;
}

/** Progress ring against the budget target. Fills past the ring when over. */
function TargetRing({ target }: { target: BudgetTarget }) {
  const over = target.status === "over";
  const color = over ? "#fb7185" : "#34d399";
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(Math.max(target.pct_used, 0), 100);

  return (
    <div className="relative w-[104px] h-[104px] shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
        <motion.circle
          cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - filled / 100) }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold leading-none" style={{ color }}>{Math.round(target.pct_used)}%</span>
        <span className="text-[9px] uppercase tracking-wider text-[var(--fg-muted)] mt-1">of target</span>
      </div>
    </div>
  );
}

/**
 * Per-day pacing and the burn-down: prepaid money is already gone at departure,
 * then pocket money drains across the trip.
 */
function TripPacing({ result }: { result: BudgetResult }) {
  // The frontend and backend deploy independently, so tolerate a result computed
  // by a backend that predates these fields.
  const { trip, target } = result;
  if (!trip || (trip.days === 0 && !target)) return null;

  const hasChart = trip.days >= 2;
  const dailyOver = target != null && target.daily_delta_pct > 0;

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <p className="text-sm font-medium text-white flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-indigo-400" />
        {trip.nights > 0 ? `${trip.nights} nights · ${trip.days} days of spending` : "Pace & target"}
      </p>

      {trip.days > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="All-in per day" value={formatINR(trip.per_day_all_in_inr)} sub="everything ÷ days" />
          <StatTile label="Cash per day" value={formatINR(trip.per_day_on_ground_inr)} sub="pocket money ÷ days" color="#34d399" />
          <StatTile label="Free per day" value={formatINR(trip.per_day_free_inr)} sub="after booked costs" />
          <StatTile label="Per night stay" value={formatINR(trip.per_night_stay_inr)} sub="your share" />
        </div>
      )}

      {target && (
        <div className="flex items-center gap-4 rounded-xl bg-white/3 border border-white/5 p-3">
          <TargetRing target={target} />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold" style={{ color: target.status === "over" ? "#fb7185" : "#34d399" }}>
              {target.status === "over"
                ? `${formatINR(target.delta_inr)} over`
                : `${formatINR(Math.abs(target.delta_inr))} to spare`}
            </p>
            <p className="text-[11px] text-[var(--fg-muted)]">
              Target {formatINR(target.amount_inr)}
              {target.per_day_inr > 0 && <> · {formatINR(target.per_day_inr)}/day allowance</>}
            </p>
            {target.per_day_inr > 0 && (
              <p className="text-[11px] text-[var(--fg-muted)]">
                You&apos;re pacing{" "}
                <span className={dailyOver ? "text-rose-300 font-medium" : "text-emerald-300 font-medium"}>
                  {Math.abs(target.daily_delta_pct)}% {dailyOver ? "over" : "under"}
                </span>{" "}
                your daily average.
              </p>
            )}
            {target.crossover_day != null && (
              <p className="text-[11px] text-amber-300">
                {target.crossover_day === 0
                  ? "Prepaid costs alone already pass the target."
                  : `You cross the target on day ${target.crossover_day}.`}
              </p>
            )}
          </div>
        </div>
      )}

      {hasChart && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] text-[var(--fg-muted)]">Burn-down</p>
            <div className="flex items-center gap-3 text-[10px] text-[var(--fg-muted)]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Cash left
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-400" /> Spent so far
              </span>
            </div>
          </div>
          <div className="h-[150px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trip.burn_down} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="cashLeft" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--fg-muted)" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compactINR} tick={{ fontSize: 10, fill: "var(--fg-muted)" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  formatter={(v, name) => [formatINR(Number(v)), name === "cash_left_inr" ? "Cash left" : "Spent so far"]}
                  labelFormatter={(day) => (day === 0 ? "Departure" : `Day ${day}`)}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)", fontSize: 12 }}
                />
                {target && (
                  <ReferenceLine y={target.amount_inr} stroke="#fb7185" strokeDasharray="4 4" strokeWidth={1}
                    label={{ value: "Target", position: "insideTopRight", fill: "#fb7185", fontSize: 9 }} />
                )}
                <Area type="monotone" dataKey="cash_left_inr" stroke="#34d399" strokeWidth={2} fill="url(#cashLeft)" />
                <Line type="monotone" dataKey="cumulative_inr" stroke="#818cf8" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/** Who fronted what, and the shortest set of transfers that squares everyone up. */
function SettleUp({ settlement }: { settlement: Settlement }) {
  const { members, transfers, group_total_inr, unattributed_inr } = settlement;
  const biggest = Math.max(...members.map(m => Math.abs(m.net_inr)), 1);

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-amber-400" /> Settle up
        </p>
        <span className="text-[11px] text-[var(--fg-muted)]">{formatINR(group_total_inr)} fronted</span>
      </div>

      <div className="space-y-2">
        {members.map(m => {
          const owed = m.net_inr > 0;
          const color = Math.abs(m.net_inr) < 1 ? "#64748b" : owed ? "#34d399" : "#fb7185";
          return (
            <div key={m.name} className="space-y-1">
              <div className="flex items-baseline gap-2 text-xs">
                <span className="text-white truncate">{m.name}</span>
                <span className="text-[10px] text-[var(--fg-muted)] shrink-0">
                  paid {formatINR(m.paid_inr)} · owes {formatINR(m.share_inr)}
                </span>
                <span className="ml-auto font-medium shrink-0" style={{ color }}>
                  {Math.abs(m.net_inr) < 1
                    ? "square"
                    : owed
                      ? `gets ${formatINR(m.net_inr)}`
                      : `owes ${formatINR(-m.net_inr)}`}
                </span>
              </div>
              <Meter value={Math.abs(m.net_inr)} total={biggest} color={color} />
            </div>
          );
        })}
      </div>

      <div className="border-t border-[var(--border)] pt-2 space-y-1.5">
        {transfers.length === 0 ? (
          <p className="text-xs text-[var(--fg-muted)]">
            All square — mark who paid each bill to see who owes whom.
          </p>
        ) : (
          transfers.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="text-white truncate">{t.from}</span>
              <ArrowRight className="w-3 h-3 text-[var(--fg-muted)] shrink-0" />
              <span className="text-white truncate">{t.to}</span>
              <span className="ml-auto font-semibold text-amber-300 shrink-0">{formatINR(t.amount_inr)}</span>
            </div>
          ))
        )}
        {unattributed_inr > 0 && (
          <p className="text-[10px] text-[var(--fg-muted)]/70 pt-1">
            {formatINR(unattributed_inr)} isn&apos;t in the ledger — those rows have no payer, so everyone
            covered their own.
          </p>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/5 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)] mb-1 truncate">{label}</p>
      <p className="text-sm font-semibold" style={color ? { color } : undefined}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--fg-muted)] mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

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

  const slices = budgetSlices(result).sort((a, b) => b.value - a.value);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const biggest = slices[0];
  const shortfall = Math.max(-cc.free_spend_inr, 0);
  const usdRate = result.rates_used?.USD ?? 0;
  const toUsd = (inr: number) => (usdRate > 0 ? inr / usdRate : 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Grand total — animated counter, then how that money splits */}
      <div className="glass rounded-2xl p-6 border border-emerald-500/30 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)] mb-1">Grand Total (Your Share)</p>
          <p className="text-4xl font-bold gradient-text">{formatINR(displayedINR)}</p>
          <p className="text-[var(--fg-muted)] text-sm mt-1">≈ {formatUSD(gt.usd)}</p>
        </div>

        <SplitStrip
          thick
          segments={[
            { label: "Prepaid at home", value: gt.prepaid_inr, color: "#6366f1" },
            { label: "Booked, paid abroad", value: cc.committed_inr, color: "#f59e0b" },
            { label: "Free to spend", value: Math.max(cc.free_spend_inr, 0), color: "#ec4899" },
          ]}
        />

        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Prepaid"
            value={formatINR(gt.prepaid_inr)}
            sub={`${pctLabel(gt.prepaid_inr, gt.inr)} · before you fly`}
          />
          <StatTile
            label="Carried"
            value={formatINR(cc.pocket_money_inr)}
            sub={formatUSD(cc.pocket_money_usd)}
          />
          <StatTile
            label="Free to spend"
            value={formatINR(Math.max(cc.free_spend_inr, 0))}
            sub={usdRate > 0 ? formatUSD(toUsd(Math.max(cc.free_spend_inr, 0))) : undefined}
            color="#34d399"
          />
        </div>

        {shortfall > 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-rose-300">
            <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Pocket money is {formatINR(shortfall)} short of the sightseeing and on-arrival
            extras you&apos;ve already listed.
          </p>
        ) : biggest && (
          <p className="text-xs text-[var(--fg-muted)]">
            <span className="text-white font-medium">{biggest.label}</span> is your biggest line —{" "}
            {pctLabel(biggest.value, total)} of the trip.
          </p>
        )}
      </div>

      <TripPacing result={result} />

      {/* Donut + per-category meters */}
      <div className="glass rounded-2xl p-4">
        <p className="text-sm font-medium text-white">Where the money goes</p>
        <p className="text-[11px] text-[var(--fg-muted)] mt-0.5 mb-3">
          Sightseeing and on-arrival extras are paid out of pocket money, so nothing is counted twice.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-[168px] h-[168px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius={54} outerRadius={80} paddingAngle={2} stroke="none">
                  {slices.map(s => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [formatINR(Number(v)), String(name)]}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--fg)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] uppercase tracking-wider text-[var(--fg-muted)]">Total</span>
              <span className="text-sm font-semibold text-white">{formatINR(gt.inr)}</span>
            </div>
          </div>

          <div className="flex-1 w-full space-y-2">
            {slices.map((s, i) => (
              <div key={s.key} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <s.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: s.color }} />
                  <span className="text-[var(--fg-muted)] truncate">{s.label}</span>
                  <span className="ml-auto text-white font-medium shrink-0">{formatINR(s.value)}</span>
                  <span className="w-8 text-right text-[10px] text-[var(--fg-muted)] shrink-0">
                    {pctLabel(s.value, total)}
                  </span>
                </div>
                <Meter value={s.value} total={total} color={s.color} delay={i * 0.06} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed costs */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-white">1. Fixed Costs</p>
        <ResultSection label="Flights" total={fc.flights.total_inr} of={fc.total_inr} color="#6366f1">
          {fc.flights.items.map((f, i) => (
            <Row key={i} label={f.date ? `${f.route} · ${f.date}` : f.route} value={formatINR(f.amount_inr)} />
          ))}
        </ResultSection>
        <ResultSection label="Stays" total={fc.stays.total_inr} of={fc.total_inr} color="#10b981">
          {fc.stays.items.map((s, i) => (
            <Row key={i} label={`${s.destination} (${s.split})`} value={formatINR(s.per_person_inr)} />
          ))}
        </ResultSection>
        {fc.sightseeing.total_inr > 0 && (
          <ResultSection label="Sightseeing" total={fc.sightseeing.total_inr} of={fc.total_inr} color="#f59e0b">
            {fc.sightseeing.items.map((s, i) => (
              <Row key={i} label={`${s.name} (${s.original})`} value={formatINR(s.amount_inr)} />
            ))}
          </ResultSection>
        )}
        {fc.extras.total_inr > 0 && (
          <ResultSection label="Extras" total={fc.extras.total_inr} of={fc.total_inr} color="#8b5cf6">
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
      <div className="glass rounded-2xl p-4 space-y-3">
        <p className="text-sm font-medium text-white">2. Cash Conversion</p>
        <SplitStrip
          segments={[
            ...cc.allocations.map((a, i) => ({
              label: a.currency,
              value: a.inr_spent,
              color: CASH_COLORS[i % CASH_COLORS.length],
            })),
            { label: "USD / forex card", value: Math.max(cc.usd_forex_remaining_inr, 0), color: "#64748b" },
          ]}
        />
        <div className="space-y-2">
          <Row label="Pocket money" value={`$${formatNumber(cc.pocket_money_usd)} = ${formatINR(cc.pocket_money_inr)}`} />
          {cc.allocations.map((a, i) => (
            <Row key={i} label={`→ ${a.display}`} value={formatINR(a.inr_spent)} sub />
          ))}
          <Row label="Remaining on USD/Forex card" value={`${formatUSD(cc.usd_forex_remaining_usd)} (${formatINR(cc.usd_forex_remaining_inr)})`} />
        </div>
      </div>

      {result.settlement && <SettleUp settlement={result.settlement} />}
    </motion.div>
  );
}

function ResultSection({
  label, total, of, color, children,
}: { label: string; total: number; of?: number; color?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/5 p-3 space-y-1">
      <div className="flex items-baseline justify-between text-xs font-medium text-[var(--fg-muted)]">
        <span>{label}</span>
        <span className="flex items-baseline gap-2">
          <span className="text-white">{formatINR(total)}</span>
          {of != null && of > 0 && <span className="text-[10px]">{pctLabel(total, of)}</span>}
        </span>
      </div>
      {of != null && of > 0 && (
        <div className="pb-1.5">
          <Meter value={total} total={of} color={color ?? "#6366f1"} />
        </div>
      )}
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
  control, register, watch, name, labelField, accent, badge, onCopyRoutes, members = [],
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  watch: UseFormWatch<FormValues>;
  name: "flights" | "flights_b";
  labelField: "case_a_label" | "case_b_label";
  accent: "emerald" | "indigo";
  badge: string;
  onCopyRoutes?: () => void;
  members?: string[];
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
            <PaidByField members={members} {...register(`${name}.${i}.paid_by` as const)} />
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

