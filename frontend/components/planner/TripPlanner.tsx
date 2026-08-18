"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, useFieldArray, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Globe, RefreshCw, Luggage, Shield, Send, Copy, Check,
  Download, Share2, BookOpen, Plus, Trash2, Cloud,
  Thermometer, Wind, Droplets, PlusCircle, ShieldCheck, Printer,
  ChevronDown, ChevronUp, GripVertical,
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
import { CityHero } from "@/components/ui/CityHero";
import { BackToTop } from "@/components/ui/BackToTop";
import { toast } from "sonner";
import { QRCodeButton } from "@/components/ui/QRCodeButton";
import { CalendarExportButton } from "@/components/ui/CalendarExport";
import Image from "next/image";
import dynamic from "next/dynamic";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    <div className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)] animate-pulse">
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
      <div className="flex items-center gap-1 text-[var(--fg-muted)]">
        <Thermometer className="w-3 h-3 text-amber-400" /> {c.temp_c}°C
      </div>
      <div className="flex items-center gap-1 text-[var(--fg-muted)]">
        <Droplets className="w-3 h-3 text-sky-400" /> {c.humidity}%
      </div>
      <div className="flex items-center gap-1 text-[var(--fg-muted)]">
        <Wind className="w-3 h-3 text-emerald-400" /> {c.wind_kmph} km/h
      </div>
      <span className="text-[var(--fg-muted)]">{c.description}</span>
    </motion.div>
  );
}

// ─── sortable multi-city stop ─────────────────────────────────────────────────

function SortableStop({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-50" : ""}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-3 text-[var(--fg-muted)] hover:text-white cursor-grab active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}

// ─── multi-city hero photo essay ──────────────────────────────────────────────

function MultiCityHeroes({ control }: { control: Control<MultiForm> }) {
  const stops = useWatch({ control, name: "stops" });
  const valid = (stops ?? []).filter((s) => s?.city?.trim());

  if (valid.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mb-6"
      data-testid="multi-city-heroes"
    >
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
          ⁘ Photo essay · {valid.length} {valid.length === 1 ? "stop" : "stops"}
        </p>
        <span className="text-[10px] font-mono text-[var(--fg-dim)] uppercase tracking-[0.1em]">
          via Wikipedia
        </span>
      </div>

      <div
        className={cn(
          "grid gap-3",
          valid.length === 1 && "grid-cols-1",
          valid.length === 2 && "sm:grid-cols-2",
          valid.length === 3 && "sm:grid-cols-3",
          valid.length >= 4 && "sm:grid-cols-2 md:grid-cols-4",
        )}
      >
        {valid.map((s, i) => (
          <div
            key={`${s.city}-${i}`}
            className="relative rounded-xl border border-[var(--border)] overflow-hidden aspect-[4/3] group hover-lift"
            data-testid={`multi-hero-stop-${i}`}
          >
            <div className="absolute inset-0 pointer-events-none">
              <CityHero city={s.city} variant="compact" className="!border-0 !rounded-none aspect-auto h-full" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)]/85 via-[var(--bg)]/30 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 bottom-0 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-mono text-[10px] text-[var(--accent-hover)] uppercase tracking-[0.14em]">
                  Stop {String(i + 1).padStart(2, "0")}
                </span>
                {s.days && (
                  <span className="text-[10px] text-[var(--fg-dim)] font-mono">
                    · {s.days}d
                  </span>
                )}
              </div>
              <p className="font-display text-2xl leading-tight tracking-tight text-[var(--fg)] truncate">
                {s.city}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}



// ─── multi-city route map ─────────────────────────────────────────────────────

const RouteMapDynamic = dynamic(() => import("@/components/ui/RouteMap").then(m => m.RouteMap), {
  ssr: false,
  loading: () => <div className="h-[260px] rounded-xl bg-[var(--surface)] animate-pulse" />,
});

function MultiCityRouteMap({ control }: { control: Control<MultiForm> }) {
  const stops = useWatch({ control, name: "stops" });
  const valid = (stops ?? []).filter((s) => s?.city?.trim());
  const [geoStops, setGeoStops] = useState<Array<{ city: string; lat: number; lng: number }>>([]);

  // Geocode cities via Photon (free, no key)
  useEffect(() => {
    if (valid.length < 2) { setGeoStops([]); return; }
    let cancelled = false;
    (async () => {
      const results: Array<{ city: string; lat: number; lng: number }> = [];
      for (const s of valid) {
        try {
          const resp = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(s.city)}&limit=1&lang=en`);
          const data = await resp.json();
          const feat = data?.features?.[0];
          if (feat) {
            const [lng, lat] = feat.geometry.coordinates;
            results.push({ city: s.city, lat, lng });
          }
        } catch { /* skip failed geocodes */ }
      }
      if (!cancelled) setGeoStops(results);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid.map(s => s.city).join("|")]);

  if (geoStops.length < 2) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-2">
        ⁘ Route map · {geoStops.length} stops
      </p>
      <RouteMapDynamic stops={geoStops} />
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
    } catch (e) {
      console.debug("Recent cities: unable to read from localStorage", e);
    }
  }, []);

  const addCity = useCallback((city: string) => {
    if (!city.trim()) return;
    setCities(prev => {
      const updated = [city, ...prev.filter(c => c !== city)].slice(0, 6);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      } catch (e) {
        console.debug("Recent cities: unable to persist to localStorage", e);
      }
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
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const copiedDayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (copiedDayTimer.current) clearTimeout(copiedDayTimer.current); }, []);

  const sections = useMemo(() => content.split(/(?=^## Day \d)/m), [content]);

  const copySection = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedDay(idx);
    if (copiedDayTimer.current) clearTimeout(copiedDayTimer.current);
    copiedDayTimer.current = setTimeout(() => setCopiedDay(null), 2000);
  };

  const toggleCollapse = (idx: number) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  return (
    <div>
      {sections.map((section, i) => {
        const isDaySection = /^## Day \d/m.test(section);
        const isCollapsed = collapsed.has(i);
        const dayTitle = section.match(/^## (Day \d+[^\n]*)/m)?.[1];

        if (isDaySection) {
          return (
            <div key={i} className="relative group/day border border-white/5 rounded-xl mb-3 overflow-hidden">
              {/* Day header bar — click to collapse */}
              <div
                className="flex items-center justify-between px-3 py-2 bg-white/3 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => toggleCollapse(i)}
              >
                <span className="text-emerald-300 font-semibold text-sm">{dayTitle}</span>
                <div className="flex items-center gap-2 no-print">
                  <button
                    onClick={e => { e.stopPropagation(); copySection(section, i); }}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[var(--fg-muted)] hover:text-white"
                  >
                    {copiedDay === i
                      ? <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
                      : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                  {isCollapsed
                    ? <ChevronDown className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                    : <ChevronUp className="w-3.5 h-3.5 text-[var(--fg-muted)]" />}
                </div>
              </div>
              {!isCollapsed && (
                <div className="px-3 pb-2 prose-trip text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {section.replace(/^## Day [^\n]+\n/, "")}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={i} className="prose-trip text-sm">
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

  // Timer refs — cleared on unmount to prevent setState on unmounted component
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sharedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    if (sharedTimer.current) clearTimeout(sharedTimer.current);
  }, []);

  const { trips, save, remove, load } = useTripHistory();
  const { cities: recentCities, addCity: addRecentCity } = useRecentCities();

  // Ref for back-to-top scroll detection
  const outputRef = useRef<HTMLDivElement>(null);

  // hCaptcha ref — only active when NEXT_PUBLIC_HCAPTCHA_SITE_KEY is set
  const hcaptchaRef = useRef<HCaptcha>(null);
  const [captchaToken, setCaptchaToken] = useState<string>("");
  const HCAPTCHA_KEY = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? "";

  // DnD sensors for multi-city drag reorder
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Cmd/Ctrl + Enter submits the active form
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (mode === "plan" || mode === "packing" || mode === "visa") {
          handleSubmit(onSingleSubmit)();
        } else if (mode === "multi") {
          multiForm.handleSubmit(onMultiSubmit)();
        } else if (mode === "insurance") {
          insuranceForm.handleSubmit(onInsuranceSubmit)();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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

  // Hydrate from URL query params (landing page wizard deep-link)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const qCity = params.get("city");
    const qDays = params.get("days");
    const qStyle = params.get("travel_style");
    const qBudget = params.get("budget");
    if (qCity) setValue("city", qCity);
    if (qDays) setValue("days", parseInt(qDays, 10) || 3);
    if (qStyle) setValue("travel_style", qStyle as "relaxed" | "balanced" | "adventurous" | "family-friendly");
    if (qBudget) setValue("budget", qBudget as "low" | "medium" | "luxury");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, colors: ["#34d399", "#10b981", "#f59e0b", "#34d399"] });
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

  async function freshCaptchaToken(): Promise<string | undefined> {
    if (!HCAPTCHA_KEY) return undefined;
    if (!hcaptchaRef.current) throw new Error("Captcha is still loading. Please try again.");
    const { response } = await hcaptchaRef.current.execute({ async: true });
    setCaptchaToken(response);
    hcaptchaRef.current.resetCaptcha();
    return response;
  }
  // ── multi-city drag reorder ──────────────────────────────────────────────
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = stopFields.findIndex(f => f.id === active.id);
      const newIndex = stopFields.findIndex(f => f.id === over.id);
      const current = multiForm.getValues("stops");
      multiForm.setValue("stops", arrayMove(current, oldIndex, newIndex));
    }
  };
  // ── single submit ────────────────────────────────────────────────────────
  const onSingleSubmit = async (v: SingleForm) => {
    addRecentCity(v.city);
    const interests = v.interests.split(",").map(s => s.trim()).filter(Boolean);
    if (mode === "plan") {
      try {
        const token = captchaToken || await freshCaptchaToken();
        setCaptchaToken("");
        startStream((oc, od, oe) => api.planTrip({ city: v.city, days: v.days, interests, budget: v.budget, travel_style: v.travel_style, dietary: v.dietary, travel_date: v.travel_date, currency: v.currency }, oc, od, oe, token));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Captcha verification could not start.");
      }
    } else if (mode === "packing") {
      startStream((oc, od, oe) => api.packingList({ city: v.city, days: v.days, travel_style: v.travel_style, interests, travel_date: v.travel_date }, oc, od, oe));
    } else if (mode === "visa") {
      startStream((oc, od, oe) => api.visaInfo({ destination: v.city }, oc, od, oe));
    }
  };

  // ── multi-city submit ────────────────────────────────────────────────────
  const onMultiSubmit = async (v: MultiForm) => {
    v.stops.forEach(s => addRecentCity(s.city));
    let token: string | undefined;
    try {
      token = captchaToken || await freshCaptchaToken();
      setCaptchaToken("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Captcha verification could not start.");
      return;
    }
    startStream((oc, od, oe) => api.multiCityPlan({
      stops: v.stops,
      interests: v.interests.split(",").map(s => s.trim()).filter(Boolean),
      budget: v.budget, travel_style: v.travel_style,
      dietary: v.dietary, currency: v.currency,
    }, oc, od, oe, token));
  };

  // ── insurance submit ─────────────────────────────────────────────────────
  const onInsuranceSubmit = (v: InsuranceForm) => {
    startStream((oc, od, oe) => api.estimateInsurance(v, oc, od, oe));
  };

  const handleRefine = async () => {
    if (!output || !feedback.trim()) return;
    try {
      const token = captchaToken || await freshCaptchaToken();
      setCaptchaToken("");
      startStream((oc, od, oe) => api.refineTrip({ itinerary: output, feedback }, oc, od, oe, token));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Captcha verification could not start.");
    }
    setFeedback("");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fname = `tripmind-${city || "trip"}-${new Date().toISOString().slice(0,10)}.md`;
    downloadMarkdown(fname, output);
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    if (!output) return;
    try {
      // Create a public read-only share on the backend
      const { path } = await api.createShare({
        title: `${city || "Trip"} — ${days}-day itinerary`,
        city: city || "",
        country: "",
        days,
        markdown: output,
      });
      const url = `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;

      // Use native share sheet on mobile if available
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({
            title: `${city || "Trip"} — ${days}-day itinerary`,
            text: `A ${days}-day trip plan for ${city} — read-only link`,
            url,
          });
          setShared(true);
          if (sharedTimer.current) clearTimeout(sharedTimer.current);
          sharedTimer.current = setTimeout(() => setShared(false), 3000);
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      // Fallback: copy to clipboard + toast
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Public link copied", {
          description: url,
          action: {
            label: "Open",
            onClick: () => window.open(url, "_blank"),
          },
        });
      } catch {
        // Clipboard permission denied (headless / insecure origin) — show the URL in the toast
        toast.success("Public link ready", {
          description: url,
          action: {
            label: "Open",
            onClick: () => window.open(url, "_blank"),
          },
          duration: 8000,
        });
      }
      setShared(true);
      if (sharedTimer.current) clearTimeout(sharedTimer.current);
      sharedTimer.current = setTimeout(() => setShared(false), 3000);
    } catch (e) {
      // Fallback to old fragment URL if backend share fails
      const url = buildShareUrl(city, days, output);
      try {
        await navigator.clipboard.writeText(url);
        toast.error("Public share unavailable — copied a self-contained link instead");
      } catch {
        // Both backend + clipboard failed — surface the link in the toast so the user can copy manually
        toast.error("Public share unavailable", {
          description: url,
          duration: 8000,
        });
      }
      setShared(true);
      if (sharedTimer.current) clearTimeout(sharedTimer.current);
      sharedTimer.current = setTimeout(() => setShared(false), 3000);
      // Non-critical: log for debugging in dev only
      if (process.env.NODE_ENV !== "production") {
        console.warn("Share (backend) failed, using fragment URL:", e);
      }
    }
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
          <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Budget</label>
          <select className="input-dark" {...reg("budget")}>
          <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="luxury">Luxury</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Style</label>
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
          <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Dietary</label>
          <input className="input-dark" placeholder="vegetarian, halal…" {...reg("dietary")} />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Currency</label>
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
        <h1 className="font-display text-4xl md:text-5xl leading-[1] tracking-tight text-[var(--fg)] mb-2">AI Trip Planner</h1>
        <p className="text-[var(--fg-muted)]">Streaming itineraries · Multi-city · Visa & packing · Insurance · History</p>
      </div>

      <div className="grid lg:grid-cols-[400px_1fr] gap-6">
        {/* ══ Left: forms ══════════════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* Mode selector — scrollable on narrow screens */}
          <div className="glass rounded-xl p-1 flex gap-0.5 overflow-x-auto scrollbar-hide">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" onClick={() => setMode(id)}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-lg text-[10px] font-medium transition-colors shrink-0 min-w-[60px]",
                  mode === id ? "bg-emerald-600 text-white" : "text-[var(--fg-muted)] hover:text-white"
                )}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>

          {/* ── Single-city form ── */}
          {(mode === "plan" || mode === "packing" || mode === "visa") && (
            <form onSubmit={handleSubmit(onSingleSubmit)} className="glass rounded-2xl p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">City / Destination *</label>
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
                        className="text-[10px] rounded-full border border-emerald-500/30 bg-emerald-600/10 text-emerald-300 px-2 py-0.5 hover:bg-emerald-600/20 transition-colors"
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
                  <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Days (1–14)</label>
                  <input type="number" min={1} max={14} className="input-dark"
                    {...register("days", { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Travel Date</label>
                  <input type="date" min={today} className="input-dark h-9"
                    data-testid="single-travel-date" {...register("travel_date")} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Interests</label>
                <input className="input-dark" placeholder="temples, street food, hiking" {...register("interests")} />
              </div>
              {sharedFormFields(register)}

              {/* hCaptcha — only rendered when NEXT_PUBLIC_HCAPTCHA_SITE_KEY is set */}
              {HCAPTCHA_KEY && (
                <HCaptcha
                  ref={hcaptchaRef}
                  sitekey={HCAPTCHA_KEY}
                  size="invisible"
                  onVerify={(token) => setCaptchaToken(token)}
                  onExpire={() => setCaptchaToken("")}
                />
              )}

              {/* Streaming progress bar */}
              {streaming && mode === "plan" && (
                <div className="space-y-1 no-print">
                  <div className="flex justify-between text-[10px] text-[var(--fg-muted)]">
                    <span>{daysCompleted > 0 ? `Writing Day ${daysCompleted}…` : "Starting…"}</span>
                    <span>{daysCompleted} / {days} days</span>
                  </div>
                  <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-500 rounded-full"
                      initial={{ width: "5%" }}
                      animate={{ width: `${Math.max(5, (daysCompleted / days) * 100)}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>
              )}

              <button type="submit" disabled={streaming}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
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
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={stopFields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                  {stopFields.map((f, i) => (
                    <SortableStop key={f.id} id={f.id}>
                      <div className="rounded-xl bg-white/3 border border-white/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-emerald-300">Stop {i + 1}</span>
                    {stopFields.length > 2 && (
                      <button type="button" onClick={() => removeStop(i)}
                        className="text-red-400/60 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[var(--fg-muted)] mb-0.5 block">City *</label>
                      <input className="input-dark text-xs" placeholder="Bangkok"
                        {...multiForm.register(`stops.${i}.city`)} />
                    </div>
                    <div>
                      <label className="text-[10px] text-[var(--fg-muted)] mb-0.5 block">Days</label>
                      <input type="number" min={1} max={14} className="input-dark text-xs"
                        {...multiForm.register(`stops.${i}.days`, { valueAsNumber: true })} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--fg-muted)] mb-0.5 block">Arrival date</label>
                    <input type="date" min={today} className="input-dark h-8 text-xs"
                      data-testid={`multi-stop-date-${i}`} {...multiForm.register(`stops.${i}.date`)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--fg-muted)] mb-0.5 block">Notes (optional)</label>
                    <input className="input-dark text-xs" placeholder="focus on street food…"
                      {...multiForm.register(`stops.${i}.notes`)} />
                  </div>
                </div>
              </SortableStop>
            ))}
                </SortableContext>
              </DndContext>
              <button type="button"
                onClick={() => append({ city: "", days: 2, date: today, notes: "" })}
                className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-sm transition-colors">
                <Plus className="w-4 h-4" /> Add city
              </button>
              <div>
                <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Interests</label>
                <input className="input-dark" placeholder="temples, food, adventure"
                  {...multiForm.register("interests")} />
              </div>
              {sharedFormFields(multiForm.register)}
              <button type="submit" disabled={streaming}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
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
                <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Destination(s)</label>
                <input className="input-dark" placeholder="Vietnam, Malaysia"
                  {...insuranceForm.register("destination")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Trip cost (USD)</label>
                  <input type="number" min={0} className="input-dark"
                    {...insuranceForm.register("trip_cost_usd", { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Duration (days)</label>
                  <input type="number" min={1} className="input-dark"
                    {...insuranceForm.register("duration_days", { valueAsNumber: true })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Travellers</label>
                  <input type="number" min={1} className="input-dark"
                    {...insuranceForm.register("travelers", { valueAsNumber: true })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--fg-muted)] mb-1 block">Average age</label>
                  <input type="number" min={1} max={120} className="input-dark"
                    {...insuranceForm.register("traveler_age", { valueAsNumber: true })} />
                </div>
              </div>
              <button type="submit" disabled={streaming}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-60">
                {streaming
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Estimating…</>
                  : <><ShieldCheck className="w-4 h-4" /> Estimate Insurance</>}
              </button>
            </form>
          )}

          {/* Quick examples (single mode only) */}
          {(mode === "plan") && (
            <div className="glass rounded-2xl p-4">
              <p className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-3">Quick examples</p>
              <div className="space-y-2">
                {EXAMPLES.map(ex => (
                  <button key={ex.city} type="button"
                    onClick={() => { setValue("city", ex.city); setValue("days", ex.days); setValue("interests", ex.interests); setValue("budget", ex.budget); setValue("travel_style", ex.style); }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm">
                    <span className="text-white font-medium">{ex.city}</span>
                    <span className="text-[var(--fg-muted)] text-xs ml-2">{ex.days}d · {ex.style}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ══ Right: output ════════════════════════════════════════════════ */}
        <div className="glass rounded-2xl flex flex-col min-h-[350px] md:min-h-[600px] relative">
          {/* Tab bar */}
          <div className="flex gap-1 p-3 border-b border-[var(--border)] flex-wrap">
            {(["output", "refine", "history"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize",
                  activeTab === tab
                    ? "bg-emerald-600/20 text-emerald-300 border border-emerald-500/30"
                    : "text-[var(--fg-muted)] hover:text-white"
                )}>
                {tab === "history" ? `History (${trips.length})` : tab === "output" ? "Output" : "Refine"}
              </button>
            ))}

            {/* Action buttons — scrollable on mobile */}
            {output && (
              <div className="ml-auto flex gap-1 no-print overflow-x-auto">
                <ActionBtn icon={copied ? Check : Copy} label={copied ? "Copied" : "Copy"} active={copied} onClick={handleCopy} />
                <ActionBtn icon={Download} label="Download" onClick={handleDownload} />
                <CalendarExportButton city={city} days={days} travelDate={travelDate} itinerary={output} />
                <ActionBtn icon={Printer} label="Print" onClick={handlePrint} />
                <ActionBtn icon={BookOpen} label="Save" onClick={handleSave} />
                <ActionBtn icon={shared ? Check : Share2} label={shared ? "Copied!" : "Share"} active={shared} onClick={handleShare} />
                {output && <QRCodeButton url={buildShareUrl(city, days, output)} title={`${city || "Trip"} · ${days}d`} />}
              </div>
            )}
          </div>

          {/* Content area */}
          <div ref={outputRef} className="flex-1 overflow-auto p-5">
            <BackToTop scrollRef={outputRef} />
            {/* ── Output tab ── */}
            {activeTab === "output" && (
              <>
                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 text-sm">
                    {error}
                    <p className="mt-1 text-xs opacity-70">
                      {error.toLowerCase().includes("captcha")
                        ? "Captcha could not be verified. Wait a moment and generate again."
                        : error.toLowerCase().includes("fetch") || error.includes("HTTP 5")
                          ? "The planning service is unavailable. Please try again shortly."
                          : "Review the form and try again."}
                    </p>
                  </div>
                )}
                {!output && !streaming && !error && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-12">
                    {/* Illustrated plane + map */}
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="40" cy="40" r="38" fill="#17171b" stroke="#1f1f24" strokeWidth="2"/>
                      <circle cx="40" cy="40" r="24" fill="#111114" stroke="#1f1f24" strokeWidth="1"/>
                      <path d="M24 42 Q32 28 40 32 Q48 36 56 22" stroke="#10b981" strokeWidth="1.5" fill="none" strokeDasharray="3 2" opacity="0.6"/>
                      <circle cx="24" cy="42" r="2.5" fill="#34d399"/>
                      <circle cx="56" cy="22" r="2.5" fill="#10b981"/>
                      <g transform="translate(36,26) rotate(-30)">
                        <path d="M0 0 L6 -3 L8 0 L6 3 Z" fill="#34d399"/>
                        <path d="M2 -1 L0 -4 L3 -3 Z" fill="#6366f1"/>
                        <path d="M2 1 L0 4 L3 3 Z" fill="#6366f1"/>
                      </g>
                    </svg>
                    <div>
                      <p className="text-white font-medium mb-1">Your itinerary will appear here</p>
                      <p className="text-[var(--fg-muted)] text-sm max-w-xs">
                        Fill in the form and click <span className="text-emerald-400">Generate</span> — streamed live
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {["Kyoto, Japan","Bali, Indonesia","Barcelona, Spain"].map(eg => (
                        <span key={eg} className="text-[10px] border border-emerald-500/20 bg-emerald-600/5 text-emerald-400 rounded-full px-2 py-0.5">{eg}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(output || streaming) && (
                  <>
                    {/* Editorial city hero — Wikipedia lead image with overlay caption */}
                    {city && !streaming && mode !== "multi" && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="mb-6"
                      >
                        <CityHero city={city} />
                      </motion.div>
                    )}
                    {/* Multi-city photo essay + route map */}
                    {mode === "multi" && !streaming && (
                      <>
                        <MultiCityHeroes control={multiForm.control} />
                        <MultiCityRouteMap control={multiForm.control} />
                      </>
                    )}
                    <div className="prose-trip text-sm">
                      {streaming
                        ? (
                          <>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                            <span className="inline-block w-1.5 h-4 bg-emerald-400 animate-pulse rounded ml-0.5" />
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
                <p className="text-[var(--fg-muted)] text-sm">Describe what you&apos;d like to change:</p>
                <textarea rows={5} value={feedback} onChange={e => setFeedback(e.target.value)}
                  placeholder="Make Day 2 more relaxed, swap dinner for street food…"
                  className="input-dark resize-none" />
                <button onClick={handleRefine} disabled={streaming || !output || !feedback.trim()}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors">
                  <Send className="w-4 h-4" /> Refine Itinerary
                </button>
              </div>
            )}

            {/* ── History tab ── */}
            {activeTab === "history" && (
              <div className="space-y-3">
                {trips.length === 0 ? (
                  <p className="text-[var(--fg-muted)] text-sm text-center py-8">
                    No saved trips yet. Generate an itinerary and click &quot;Save&quot;.
                  </p>
                ) : (
                  trips.map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                      <div>
                        <p className="text-white font-medium text-sm">{t.title}</p>
                        <p className="text-xs text-[var(--fg-muted)]">
                          {new Date(t.savedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleLoadTrip(t.id)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-lg px-2.5 py-1 transition-colors">
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
          : "border-white/10 text-[var(--fg-muted)] hover:text-white hover:border-white/20"
      )}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
