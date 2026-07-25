"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityOption {
  name: string;
  country: string;
  region?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const BASE =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? ""
    : "http://localhost:8000");

/**
 * Calls the backend /api/cities proxy — RAPIDAPI_KEY stays server-side, never in the browser.
 */
async function fetchCities(query: string, k = 7): Promise<CityOption[]> {
  const res = await fetch(
    `${BASE}/api/cities?q=${encodeURIComponent(query)}&k=${k}`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) return [];
  return res.json();
}

export function CityAutocomplete({
  value,
  onChange,
  placeholder = "e.g. Kyoto, Japan",
  className,
}: Props) {
  const [query, setQuery] = useState(value);
  const [options, setOptions] = useState<CityOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes (e.g. clicking an example preset)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Clear debounce timer on unmount — prevents state updates after unmount
  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchCities(q);
        setOptions(results);
        setOpen(results.length > 0);
      } catch (e: unknown) {
        if ((e as Error)?.name !== "AbortError") setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    onChange(v);
    search(v);
  };

  const handleSelect = (city: CityOption) => {
    const label = city.country ? `${city.name}, ${city.country}` : city.name;
    setQuery(label);
    onChange(label);
    setOpen(false);
    setOptions([]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-emerald-400 pointer-events-none" />
        <input
          value={query}
          onChange={handleInput}
          onFocus={() => options.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className={cn("input-dark", className)}
          style={{ paddingLeft: "2rem" }}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--fg-muted)] animate-spin pointer-events-none" />
        )}
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 left-0 right-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
          {options.map((city, i) => (
            <li key={`${city.name}-${i}`}>
              <button
                type="button"
                onMouseDown={() => handleSelect(city)}
                className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-emerald-600/20 transition-colors border-b border-white/5 last:border-0"
              >
                <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-white font-medium">{city.name}</span>
                {(city.region || city.country) && (
                  <span className="text-[var(--fg-muted)] text-xs ml-auto shrink-0">
                    {[city.region, city.country].filter(Boolean).join(", ")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
