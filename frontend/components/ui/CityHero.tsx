"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "banner" | "compact" | "background";

interface Props {
  city: string;
  country?: string;
  className?: string;
  variant?: Variant;
  overlay?: boolean;
  children?: React.ReactNode;
}

/**
 * Restrained, editorial hero image for a city.
 * Uses Wikipedia lead image via /api/city-photo (Unsplash fallback).
 * Silent-fail: renders nothing if no photo found.
 */
export function CityHero({
  city,
  country,
  className,
  variant = "banner",
  overlay = true,
  children,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

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
      .catch(() => {
        if (!alive) return;
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [city, country]);

  if (status === "error") return null;

  const isBackground = variant === "background";

  if (isBackground) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl border border-[var(--border)]", className)}>
        {status === "loading" && (
          <div className="absolute inset-0 skeleton" data-testid="city-hero-skeleton" />
        )}
        {url && (
          // Using <img> here (not next/image) because we want unbounded external URLs to load without config
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`${city} — editorial view`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            data-testid="city-hero-image"
          />
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
          <img
            src={url}
            alt={`${city}`}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-105"
            loading="lazy"
          />
        )}
      </div>
    );
  }

  // banner (default) — full-width editorial strip
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
        <img
          src={url}
          alt={`${city} — editorial view`}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          data-testid="city-hero-image"
        />
      )}
      {overlay && (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg)]/60 via-transparent to-transparent" />
        </>
      )}
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
