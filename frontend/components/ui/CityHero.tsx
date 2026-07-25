"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  MapPin,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  CloudLightning,
  CloudDrizzle,
  Droplets,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "banner" | "compact" | "background";

interface Props {
  city: string;
  country?: string;
  className?: string;
  variant?: Variant;
  overlay?: boolean;
  showWeather?: boolean;
  children?: React.ReactNode;
}

interface Weather {
  temp_c: number;
  description: string;
}

interface BestTime {
  currentScore: number;
  best_months: string[];
  avoid_months: string[];
  crowdsNow: string;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

/**
 * Restrained, editorial hero image for a city.
 * Overlays a live weather chip and a best-time-to-visit chip so travelers
 * know the season at a glance.
 */
export function CityHero({
  city,
  country,
  className,
  variant = "banner",
  overlay = true,
  showWeather = true,
  children,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [weather, setWeather] = useState<Weather | null>(null);
  const [bestTime, setBestTime] = useState<BestTime | null>(null);

  /* ── photo ────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!city) return;
    setStatus("loading");
    let alive = true;
    api
      .getCityPhoto(city, country ?? "")
      .then((data) => {
        if (!alive) return;
        setUrl(data.url);
        setStatus("done");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [city, country]);

  /* ── weather (fast, wttr.in) ─────────────────────────────────────────── */
  useEffect(() => {
    if (!city || !showWeather || variant !== "banner") return;
    let alive = true;
    api
      .getWeather({ city, date: "" })
      .then((data) => {
        if (!alive) return;
        const c = data?.current;
        if (c && typeof c.temp_c === "number") {
          setWeather({ temp_c: c.temp_c, description: c.description ?? "" });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [city, showWeather, variant]);

  /* ── best-time (LLM, slower; non-blocking) ──────────────────────────── */
  useEffect(() => {
    if (!city || !showWeather || variant !== "banner") return;
    let alive = true;
    api
      .bestTime(city)
      .then((data) => {
        if (!alive) return;
        const currentMonth = MONTHS[new Date().getMonth()];
        const monthData = data.months?.find((m) => m.month === currentMonth);
        setBestTime({
          currentScore: monthData?.score ?? 50,
          best_months: data.best_months ?? [],
          avoid_months: data.avoid_months ?? [],
          crowdsNow: monthData?.crowds ?? "",
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [city, showWeather, variant]);

  if (status === "error") return null;

  const isBackground = variant === "background";

  if (isBackground) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl border border-[var(--border)]", className)}>
        {status === "loading" && <div className="absolute inset-0 skeleton" data-testid="city-hero-skeleton" />}
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${city} — editorial view`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" data-testid="city-hero-image" />
        )}
        {overlay && (
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/70 to-transparent" />
        )}
        <div className="relative">{children}</div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-[var(--border)] aspect-[16/9] bg-[var(--surface-2)]",
          className
        )}
        data-testid={`city-hero-compact-${city.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {status === "loading" && <div className="absolute inset-0 skeleton" />}
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${city}`} className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105" loading="lazy" />
        )}
      </div>
    );
  }

  /* ── banner (default) ───────────────────────────────────────────────── */
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--border)] aspect-[21/9] md:aspect-[24/9] bg-[var(--surface-2)]",
        className
      )}
      data-testid={`city-hero-${city.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {status === "loading" && <div className="absolute inset-0 skeleton" data-testid="city-hero-skeleton" />}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={`${city} — editorial view`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" data-testid="city-hero-image" />
      )}
      {overlay && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg)]/60 via-transparent to-transparent" />
        </>
      )}

      {/* Top-right: weather + season chips */}
      {showWeather && (weather || bestTime) && (
        <div
          className="absolute top-4 right-4 flex flex-col items-end gap-2 z-10"
          data-testid="city-hero-chips"
        >
          {weather && <WeatherChip w={weather} />}
          {bestTime && <SeasonChip bt={bestTime} />}
        </div>
      )}

      {/* Bottom-left: city title */}
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-2 font-mono">
            <MapPin className="w-3 h-3" strokeWidth={1.75} />
            {country ? `${country}` : "Editorial view"}
          </div>
          <h2 className="font-display text-4xl md:text-6xl leading-[0.95] tracking-tight text-[var(--fg)]">
            {city}
          </h2>
        </div>
        {status === "done" && url && (
          <span className="hidden md:inline-flex text-[10px] uppercase tracking-[0.12em] text-[var(--fg-dim)] font-mono border border-[var(--border-strong)] bg-[var(--surface)]/60 backdrop-blur rounded-full px-2 py-1">
            via Wikipedia
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── weather chip ─────────────────────────────────────────────────────── */

function weatherIcon(desc: string) {
  const d = desc.toLowerCase();
  if (d.includes("thunder")) return CloudLightning;
  if (d.includes("snow") || d.includes("sleet") || d.includes("blizzard")) return CloudSnow;
  if (d.includes("drizzle")) return CloudDrizzle;
  if (d.includes("rain") || d.includes("shower")) return CloudRain;
  if (d.includes("mist") || d.includes("fog") || d.includes("haze")) return Droplets;
  if (d.includes("wind")) return Wind;
  if (d.includes("cloud") || d.includes("overcast")) return Cloud;
  return Sun;
}

function WeatherChip({ w }: { w: Weather }) {
  const Icon = weatherIcon(w.description);
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[color-mix(in_oklab,_var(--surface)_78%,_transparent)] backdrop-blur-md px-3 py-1.5 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)]"
      data-testid="city-hero-weather"
    >
      <Icon className="w-3.5 h-3.5 text-[var(--accent-hover)]" strokeWidth={1.75} />
      <span className="font-display text-lg leading-none text-[var(--fg)]">
        {w.temp_c}°
      </span>
      {w.description && (
        <span className="text-[11px] text-[var(--fg-muted)] max-w-[120px] truncate">
          {w.description}
        </span>
      )}
    </div>
  );
}

/* ── season chip ──────────────────────────────────────────────────────── */

function SeasonChip({ bt }: { bt: BestTime }) {
  const s = bt.currentScore;
  const tier =
    s >= 75 ? "peak" : s >= 55 ? "good" : s >= 35 ? "shoulder" : "off";

  const config = {
    peak:     { label: "Peak season now",    Icon: Sparkles,      color: "emerald" },
    good:     { label: "Great to visit",     Icon: TrendingUp,    color: "emerald" },
    shoulder: { label: "Shoulder season",    Icon: Minus,         color: "amber" },
    off:      { label: "Low season now",     Icon: TrendingDown,  color: "rose" },
  }[tier];

  const styles = {
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber:   "border-amber-500/30 bg-amber-500/10 text-amber-300",
    rose:    "border-rose-500/30 bg-rose-500/10 text-rose-300",
  }[config.color as "emerald" | "amber" | "rose"];

  const shortBest = bt.best_months.slice(0, 3).map((m) => m.slice(0, 3)).join(", ");

  return (
    <div
      className={cn(
        "inline-flex flex-col items-end gap-0.5 rounded-lg border backdrop-blur-md px-3 py-1.5 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)]",
        styles.replace("bg-", "bg-").replace(/\/10/g, "/12")
      )}
      data-testid="city-hero-season"
    >
      <div className="flex items-center gap-1.5">
        <config.Icon className="w-3 h-3" strokeWidth={2} />
        <span className="text-[11px] font-medium tracking-tight">
          {config.label}
        </span>
      </div>
      {shortBest && (
        <span className="text-[10px] font-mono uppercase tracking-[0.1em] opacity-80">
          Best: {shortBest}
        </span>
      )}
    </div>
  );
}
