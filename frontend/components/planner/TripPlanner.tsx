"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Globe, RefreshCw, Luggage, Shield, Send, Copy, Check,
  Download, Share2, BookOpen, Plus, Trash2, Cloud,
  Thermometer, Wind, Droplets, PlusCircle, ShieldCheck, Printer,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTripHistory, buildShareUrl, downloadMarkdown } from "@/lib/tripHistory";
import type { WeatherResult, CityStop } from "@/lib/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import confetti from "canvas-confetti";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";
import Image from "next/image";

const today = new Date().toISOString().slice(0, 10);

// ─── schemas ─────────────────────────────────────────────────────────────────

const singleSchema = z.object({
  city:         z.string().min(1, "City is required"),
  days:         z.number().int().min(1).max(14),
  interests:    z.string(),
  budget:       z.enum(["low", "medium", "luxury"]),
  travel_style: z.enum(["relaxed", "balanced", "adventurous", "family-friendly"]),
  dietary:      z.string(),
  travel_date:  z.string(),
  currency:     z.string(),
});
type SingleForm = z.infer<typeof singleSchema>;

const multiSchema = z.object({
  stops: z.array(z.object({
    city:  z.string().min(1),
    days:  z.number().int().min(1).max(14),
    date:  z.string(),
    notes: z.string(),
  })).min(2, "Add at least 2 cities"),
  interests:    z.string(),
  budget:       z.enum(["low", "medium", "luxury"]),
  travel_style: z.enum(["relaxed", "balanced", "adventurous", "family-friendly"]),
  dietary:      z.string(),
  currency:     z.string(),
});
type MultiForm = z.infer<typeof multiSchema>;

const insuranceSchema = z.object({
  destination:   z.string().min(1),
  trip_cost_usd: z.number().min(0),
  duration_days: z.number().int().min(1),
  travelers:     z.number().int().min(1),
  traveler_age:  z.number().int().min(1).max(120),
});
type InsuranceForm = z.infer<typeof insuranceSchema>;

// ─── sub-modes ────────────────────────────────────────────────────────────────

type PlanMode = "plan" | "packing" | "visa" | "multi" | "insurance";

const MODES: { id: PlanMode; label: string; icon: React.ElementType }[] = [
  { id: "plan",      label: "Itinerary",   icon: Globe },
  { id: "multi",     label: "Multi-city",  icon: PlusCircle },
  { id: "packing",   label: "Packing",     icon: Luggage },
  { id: "visa",      label: "Visa",        icon: Shield },
  { id: "insurance", label: "Insurance",   icon: ShieldCheck },
];

const EXAMPLES = [
  { city: "Kyoto",     days: 2, interests: "temples, ramen, gardens",        budget: "medium" as const, style: "relaxed" as const },
  { city: "Barcelona", days: 3, interests: "architecture, tapas, beach",      budget: "medium" as const, style: "balanced" as const },
  { city: "Bali",      days: 5, interests: "temples, rice fields, surfing",   budget: "low" as const,    style: "adventurous" as const },
  { city: "Da Nang",   days: 3, interests: "beaches, marble mountains, food", budget: "low" as const,    style: "balanced" as const },
];

// ─── weather mini-widget ──────────────────────────────────────────────────────

function WeatherWidget({ city }: { city: string }) {
  const { data, isLoading, isError } = useQuery<WeatherResult>({
    queryKey: ["weather", city],
    queryFn: () => api.getWeather({ city }),
    enabled: city.trim().length > 2,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (isLoading) return (
    <div className="flex items-center gap-1.5 text-xs text-[#8892b0] animate-pulse">
      <Cloud className="w-3.5 h-3.5" /> Loading weather…
    </div>
  );
  if (isError || !data || data.error) return null;

  const c = data.current;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs flex-wrap">
      <div className="flex items-center gap-1.5">
        <Cloud className="w-3.5 h-3.5 text-sky-400" />
        <span className="text-white font-medium">{data.city}</span>
      </div>
      <div className="flex items-center gap-1 text-[#8892b0]">
        <Thermometer className="w-3 h-3 text-amber-400" /> {c.temp_c}°C
      </div>
      <div className="flex items-center gap-1 text-[#8892b0]">
        <Droplets className="w-3 h-3 text-sky-400" /> {c.humidity}%
      </div>
      <div className="flex items-center gap-1 text-[#8892b0]">
        <Wind className="w-3 h-3 text-indigo-400" /> {c.wind_kmph} km/h
      </div>
      <span className="text-[#8892b0]">{c.description}</span>
    </motion.div>
  );
}

// ─── recently searched hook ───────────────────────────────────────────────────

const RECENT_KEY = "tripmind_recent_cities";

function useRecentCities() {
  const [cities, setCities] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setCities(JSON.parse(raw));
    } catch {}
  }, []);

  const addCity = useCallback((city: string) => {
    if (!city.trim()) return;
    setCities(prev => {
      const updated = [city, ...prev.filter(c => c !== city)].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  return { cities, addCity };
}

// ─── Wikipedia hero image hook ────────────────────────────────────────────────

function useWikiHero(city: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!city.trim()) { setUrl(null); return; }
    const controller = new AbortController();
    const name = city.split(",")[0].trim();
    fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`,
      { signal: controller.signal }
    )
      .then(r => r.ok ? r.json() : null)
      .then(d => setUrl(d?.thumbnail?.source ?? d?.originalimage?.source ?? null))
      .catch(e => { if (e.name !== "AbortError") setUrl(null); });
    // Abort on city change or unmount — prevents stale state updates
    return () => controller.abort();
  }, [city]);
  return url;
}

// ─── markdown with per-day copy buttons ──────────────────────────────────────

function MarkdownWithDayCopy({ content }: { content: string }) {
  const [copiedDay, setCopiedDay] = useState<number | null>(null);

  // Split on ## Day headings while keeping the heading in each section
  const sections = useMemo(() => content.split(/(?=^## Day \d)/m), [content]);

  const copySection = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedDay(idx);
    setTimeout(() => setCopiedDay(null), 2000);
  };

  return (
    <div>
      {sections.map((section, i) => {
        const isDaySection = /^## Day \d/m.test(section);
        return (
          <div key={i} className={isDaySection ? "relative group/day" : ""}>
            {isDaySection && (
              <button
                onClick={() => copySection(section, i)}
                className="absolute top-1 right-0 opacity-0 group-hover/day:opacity-100 transition-opacity flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[#8892b0] hover:text-white no-print"
              >
                {copiedDay === i
                  ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
                  : <><Copy className="w-3 h-3" /> Copy day</>}
              </button>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{section}</ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function TripPlanner() {
  const [output, setOutput]     = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError]       = useState("");
  const [mode, setMode]         = useState<PlanMode>("plan");
  const [feedback, setFeedback] = useState("");
  const [copied, setCopied]     = useState(false);
  const [shared, setShared]     = useState(false);
  const [activeTab, setActiveTab] = useState<"output" | "refine" | "history">("output");

  const { trips, save, remove, load } = useTripHistory();
  const { cities: recentCities, addCity: addRecentCity } = useRecentCities();

  // ── single-city form ─────────────────────────────────────────────────────
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<SingleForm>({
    resolver: zodResolver(singleSchema),
    defaultValues: {
      city: "", days: 3,
      interests: "sightseeing, food, culture",
      budget: "medium", travel_style: "balanced",
      dietary: "none", travel_date: today, currency: "USD",
    },
  });
  const city     = watch("city");
  const days     = watch("days");
  const travelDate = watch("travel_date");

  // Hero image for the searched city
  const heroUrl = useWikiHero(output && city ? city : "");

  // Progress: count ## Day headings in streamed output
  const daysCompleted = useMemo(() => {
    const matches = output.match(/^## Day \d/gm);
    return matches?.length ?? 0;
  }, [output]);

  // Confetti when streaming completes
  useEffect(() => {
    if (!streaming && output.length > 200) {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, colors: ["#818cf8", "#c084fc", "#fb7185", "#34d399"] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // ── multi-city form ──────────────────────────────────────────────────────
  const multiForm = useForm<MultiForm>({
    resolver: zodResolver(multiSchema),
    defaultValues: {
      stops: [
        { city: "", days: 2, date: today, notes: "" },
        { city: "", days: 2, date: today, notes: "" },
      ],
      interests: "sightseeing, food, culture",
      budget: "medium", travel_style: "balanced",
      dietary: "none", currency: "USD",
    },
  });
  const { fields: stopFields, append, remove: removeStop } = useFieldArray({
    control: multiForm.control, name: "stops",
  });

  // ── insurance form ───────────────────────────────────────────────────────
  const insuranceForm = useForm<InsuranceForm>({
    resolver: zodResolver(insuranceSchema),
    defaultValues: { destination: "", trip_cost_usd: 1500, duration_days: 7, travelers: 1, traveler_age: 30 },
  });

  function startStream(fn: (oc: (t: string) => void, od: () => void, oe: (e: Error) => void) => void) {
    setOutput("");
    setStreaming(true);
    setError("");
    setActiveTab("output");
    fn(
      (t) => setOutput(t),
      () => setStreaming(false),
      (e) => { setError(e.message); setStreaming(false); }
    );
  }

  // ── single submit ────────────────────────────────────────────────────────
  const onSingleSubmit = (v: SingleForm) => {
    addRecentCity(v.city);
    const interests = v.interests.split(",").map(s => s.trim()).filter(Boolean);
    if (mode === "plan") {
      startStream((oc, od, oe) => api.planTrip({ city: v.city, days: v.days, interests, budget: v.budget, travel_style: v.travel_style, dietary: v.dietary, travel_date: v.travel_date, currency: v.currency }, oc, od, oe));
    } else if (mode === "packing") {
      startStream((oc, od, oe) => api.packingList({ city: v.city, days: v.days, travel_style: v.travel_style, interests, travel_date: v.travel_date }, oc, od, oe));
    } else if (mode === "visa") {
      startStream((oc, od, oe) => api.visaInfo({ destination: v.city }, oc, od, oe));
    }
  };

  // ── multi-city submit ────────────────────────────────────────────────────
  const onMultiSubmit = (v: MultiForm) => {
    v.stops.forEach(s => addRecentCity(s.city));
    startStream((oc, od, oe) => api.multiCityPlan({
      stops: v.stops,
      interests: v.interests.split(",").map(s => s.trim()).filter(Boolean),
      budget: v.budget, travel_style: v.travel_style,
      dietary: v.dietary, currency: v.currency,
    }, oc, od, oe));
  };

  // ── insurance submit ─────────────────────────────────────────────────────
  const onInsuranceSubmit = (v: InsuranceForm) => {
    startStream((oc, od, oe) => api.estimateInsurance(v, oc, od, oe));
  };

  const handleRefine = () => {
    if (!output || !feedback.trim()) return;
    startStream((oc, od, oe) => api.refineTrip({ itinerary: output, feedback }, oc, od, oe));
    setFeedback("");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fname = `tripmind-${city || "trip"}-${new Date().toISOString().slice(0,10)}.md`;
    downloadMarkdown(fname, output);
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    const url = buildShareUrl(city, days, output);
    // Use native share sheet on mobile (WhatsApp, Messages, etc.)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: `${city || "Trip"} — ${days}-day itinerary`,
          text: `Check out this AI-generated ${days}-day trip plan for ${city}!`,
          url,
        });
        return;
      } catch (e) {
        // User cancelled or share failed — fall through to clipboard
        if ((e as Error).name === "AbortError") return;
      }
    }
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 3000);
  };

  const handleSave = () => {
    if (!output) return;
    save(city || "Trip", days, output);
  };

  const handleLoadTrip = (id: string) => {
    const t = load(id);
    if (t) { setOutput(t.itinerary); setActiveTab("output"); }
  };

  // ── render helpers ────────────────────────────────────────────────────────

  const sharedFormFields = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reg: any
  ) => (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[#8892b0] mb-1 block">Budget</label>
          <select className="input-dark" {...reg("budget")}>
          <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="luxury">Luxury</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[#8892b0] mb-1 block">Style</label>
          <select className="input-dark" {...reg("travel_style")}>
            <option value="relaxed">Relaxed</option>
            <option value="balanced">Balanced</option>
            <option value="adventurous">Adventurous</option>
            <option value="family-friendly">Family-friendly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-[#8892b0] mb-1 block">Dietary</label>
          <input className="input-dark" placeholder="vegetarian, halal…" {...reg("dietary")} />
        </div>
        <div>
          <label className="text-xs font-medium text-[#8892b0] mb-1 block">Currency</label>
          <select className="input-dark" {...reg("currency")}>
            {["USD","EUR","GBP","INR","SGD","AUD","JPY"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
    </>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">AI Trip Planner</h1>
        <p className="text-[#8892b0]">Streaming itineraries · Multi-city · Visa & packing · Insurance · History</p>
      </div>

      <div className="grid lg:grid-cols-[400px_1fr] gap-6">
        {/* ══ Left: forms ══════════════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* Mode selector */}
          <div className="glass rounded-xl p-1 grid grid-cols-5 gap-0.5">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setMode(id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[10px] font-medium transition-colors",
                  mode === id ? "bg-indigo-600 text-white" : "text-[#8892b0] hover:text-white"
                )}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {/* ── Single-city form ── */}
          {(mode === "plan" || mode === "packing" || mode === "visa") && (
            <form onSubmit={handleSubmit(onSingleSubmit)} className="glass rounded-2xl p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#8892b0] mb-1 block">City / Destination *</label>
                <CityAutocomplete
                  value={city}
                  onChange={v => setValue("city", v)}
                  placeholder="e.g. Kyoto, Japan"
                />
                {errors.city && <p className="text-red-400 text-xs mt-1">{errors.city.message}</p>}
                {/* Recently searched chips */}
                {recentCities.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {recentCities.map(rc => (
                      <button
                        key={rc}
                        type="button"
                        onClick={() => setValue("city", rc)}
                        className="text-[10px] rounded-full border border-indigo-500/30 bg-indigo-600/10 text-indigo-300 px-2 py-0.5 hover:bg-indigo-600/20 transition-colors"
                      >
                        {rc}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Weather widget */}
              {city.trim().length > 2 && <WeatherWidget city={city} />}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#8892b0] mb-1 block">Days (1–14)</label>
                  <input type="number" min={1} max={14} className="input-dark"
                    {...register("days", { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#8892b0] mb-1 block">Travel Date</label>
                  <input type="date" className="input-dark" {...register("travel_date")} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[#8892b0] mb-1 block">Interests</label>
                <input className="input-dark" placeholder="temples, street food, hiking" {...register("interests")} />
              </div>
              {sharedFormFields(register)}

              {/* Streaming progress bar */}
              {streaming && mode === "plan" && (
                <div className="space-y-1 no-print">
                  <div className="flex justify-between text-[10px] text-[#8892b0]">
                    <span>{daysCompleted > 0 ? `Writing Day ${daysCompleted}…` : "Starting…"}</span>
                    <span>{daysCompleted} / {days} days</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                      initial={{ width: "5%" }}
                      animate={{ width: `${Math.max(5, (daysCompleted / days) * 100)}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>
              )}

              <button type="submit" disabled={streaming}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
                {streaming
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Globe className="w-4 h-4" /> Generate</>}
              </button>
            </form>
          )}

          {/* ── Multi-city form ── */}
          {mode === "multi" && (
            <form onSubmit={multiForm.handleSubmit(onMultiSubmit)} className="glass rounded-2xl p-5 space-y-4">
              <p className="text-sm font-medium text-white">City Stops</p>
              {stopFields.map((f, i) => (
                <div key={f.id} className="rounded-xl bg-white/3 border border-white/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-indigo-300">Stop {i + 1}</span>
                    {stopFields.length > 2 && (
                      <button type="button" onClick={() => removeStop(i)}
                        className="text-red-400/60 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#8892b0] mb-0.5 block">City *</label>
                      <input className="input-dark text-xs" placeholder="Bangkok"
                        {...multiForm.register(`stops.${i}.city`)} />
                    </div>
                    <div>
                      <label className="text-[10px] text-[#8892b0] mb-0.5 block">Days</label>
                      <input type="number" min={1} max={14} className="input-dark text-xs"
                        {...multiForm.register(`stops.${i}.days`, { valueAsNumber: true })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8892b0] mb-0.5 block">Arrival date</label>
                    <input type="date" className="input-dark text-xs"
                      {...multiForm.register(`stops.${i}.date`)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8892b0] mb-0.5 block">Notes (optional)</label>
                    <input className="input-dark text-xs" placeholder="focus on street food…"
                      {...multiForm.register(`stops.${i}.notes`)} />
                  </div>
                </div>
              ))}
              <button type="button"
                onClick={() => append({ city: "", days: 2, date: today, notes: "" })}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                <Plus className="w-4 h-4" /> Add city
              </button>
              <div>
                <label className="text-xs font-medium text-[#8892b0] mb-1 block">Interests</label>
                <input className="input-dark" placeholder="temples, food, adventure"
                  {...multiForm.register("interests")} />
              </div>
              {sharedFormFields(multiForm.register)}
              <button type="submit" disabled={streaming}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
                {streaming
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating…</>
                  : <><Globe className="w-4 h-4" /> Plan Multi-city Trip</>}
              </button>
            </form>
          )}

          {/* ── Insurance form ── */}
          {mode === "insurance" && (
            <form onSubmit={insuranceForm.handleSubmit(onInsuranceSubmit)} className="glass rounded-2xl p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[#8892b0] mb-1 block">Destination(s)</label>
                <input className="input-dark" placeholder="Vietnam, Malaysia"
                  {...insuranceForm.register("destination")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#8892b0] mb-1 block">Trip cost (USD)</label>
                  <input type="number" min={0} className="input-dark"
                    {...insuranceForm.register("trip_cost_usd", { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#8892b0] mb-1 block">Duration (days)</label>
                  <input type="number" min={1} className="input-dark"
                    {...insuranceForm.register("duration_days", { valueAsNumber: true })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#8892b0] mb-1 block">Travellers</label>
                  <input type="number" min={1} className="input-dark"
                    {...insuranceForm.register("travelers", { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#8892b0] mb-1 block">Average age</label>
                  <input type="number" min={1} max={120} className="input-dark"
                    {...insuranceForm.register("traveler_age", { valueAsNumber: true })} />
                </div>
              </div>
              <button type="submit" disabled={streaming}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
                {streaming
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Estimating…</>
                  : <><ShieldCheck className="w-4 h-4" /> Estimate Insurance</>}
              </button>
            </form>
          )}

          {/* Quick examples (single mode only) */}
          {(mode === "plan") && (
            <div className="glass rounded-2xl p-4">
              <p className="text-xs font-semibold text-[#8892b0] uppercase tracking-wider mb-3">Quick examples</p>
              <div className="space-y-2">
                {EXAMPLES.map(ex => (
                  <button key={ex.city} type="button"
                    onClick={() => { setValue("city", ex.city); setValue("days", ex.days); setValue("interests", ex.interests); setValue("budget", ex.budget); setValue("travel_style", ex.style); }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm">
                    <span className="text-white font-medium">{ex.city}</span>
                    <span className="text-[#8892b0] text-xs ml-2">{ex.days}d · {ex.style}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ══ Right: output ════════════════════════════════════════════════ */}
        <div className="glass rounded-2xl flex flex-col min-h-[600px]">
          {/* Tab bar */}
          <div className="flex gap-1 p-3 border-b border-[#1e2540] flex-wrap">
            {(["output", "refine", "history"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize",
                  activeTab === tab
                    ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                    : "text-[#8892b0] hover:text-white"
                )}>
                {tab === "history" ? `History (${trips.length})` : tab === "output" ? "Output" : "Refine"}
              </button>
            ))}

            {/* Action buttons */}
            {output && (
              <div className="ml-auto flex gap-1 flex-wrap no-print">
                <ActionBtn icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} active={copied} onClick={handleCopy} />
                <ActionBtn icon={Download} label="Download" onClick={handleDownload} />
                <ActionBtn icon={Printer} label="Print" onClick={handlePrint} />
                <ActionBtn icon={BookOpen} label="Save" onClick={handleSave} />
                <ActionBtn icon={shared ? Check : Share2} label={shared ? "Copied!" : "Share"} active={shared} onClick={handleShare} />
              </div>
            )}
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto p-5">
            {/* ── Output tab ── */}
            {activeTab === "output" && (
              <>
                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
                    {error}
                    <p className="mt-1 text-xs opacity-70">Make sure the backend is running: <code>uvicorn main:app --reload</code></p>
                  </div>
                )}
                {!output && !streaming && !error && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                    <Globe className="w-12 h-12 text-indigo-400/30" />
                    <p className="text-[#8892b0] text-sm">
                      Fill in the form and click <span className="text-white">Generate</span>
                    </p>
                  </div>
                )}
                {(output || streaming) && (
                  <>
                    {/* Destination hero image */}
                    {heroUrl && !streaming && (
                      <motion.div
                        initial={{ opacity: 0, scale: 1.02 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative mb-5 rounded-xl overflow-hidden h-40 w-full"
                      >
                        <Image
                          src={heroUrl}
                          alt={city}
                          fill
                          className="object-cover"
                          unoptimized
                          onError={e => ((e.target as HTMLImageElement).style.display = "none")}
                        />
                      </motion.div>
                    )}
                    <div className="prose-trip text-sm">
                      {streaming
                        ? (
                          <>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                            <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse rounded ml-0.5" />
                          </>
                        )
                        : <MarkdownWithDayCopy content={output} />}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── Refine tab ── */}
            {activeTab === "refine" && (
              <div className="space-y-4">
                <p className="text-[#8892b0] text-sm">Describe what you&apos;d like to change:</p>
                <textarea rows={5} value={feedback} onChange={e => setFeedback(e.target.value)}
                  placeholder="Make Day 2 more relaxed, swap dinner for street food…"
                  className="input-dark resize-none" />
                <button onClick={handleRefine} disabled={streaming || !output || !feedback.trim()}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  <Send className="w-4 h-4" /> Refine Itinerary
                </button>
              </div>
            )}

            {/* ── History tab ── */}
            {activeTab === "history" && (
              <div className="space-y-3">
                {trips.length === 0 ? (
                  <p className="text-[#8892b0] text-sm text-center py-8">
                    No saved trips yet. Generate an itinerary and click &quot;Save&quot;.
                  </p>
                ) : (
                  trips.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                      <div>
                        <p className="text-white font-medium text-sm">{t.title}</p>
                        <p className="text-xs text-[#8892b0]">
                          {new Date(t.savedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleLoadTrip(t.id)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 rounded-lg px-2.5 py-1 transition-colors">
                          Load
                        </button>
                        <button onClick={() => remove(t.id)}
                          className="text-xs text-red-400/60 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  icon: Icon, label, onClick, active,
}: { icon: React.ElementType; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn(
        "flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors",
        active
          ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
          : "border-white/10 text-[#8892b0] hover:text-white hover:border-white/20"
      )}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
