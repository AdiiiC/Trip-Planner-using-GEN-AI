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

// GeoDB Cities API via RapidAPI (set NEXT_PUBLIC_RAPIDAPI_KEY in .env.local)
// Falls back to Photon by Komoot — completely free, no key required
async function fetchCities(query: string): Promise<CityOption[]> {
  const rapidKey = process.env.NEXT_PUBLIC_RAPIDAPI_KEY;

  if (rapidKey) {
    try {
      const res = await fetch(
        `https://wft-geo-db.p.rapidapi.com/v1/geo/cities?namePrefix=${encodeURIComponent(query)}&limit=7&sort=-population&types=CITY`,
        {
          headers: {
            "X-RapidAPI-Key": rapidKey,
            "X-RapidAPI-Host": "wft-geo-db.p.rapidapi.com",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        return (data.data ?? []).map((c: { city: string; country: string; region: string }) => ({
          name: c.city,
          country: c.country,
          region: c.region,
        }));
      }
    } catch {
      // fall through to Photon
    }
  }

  // Photon fallback (Komoot) — free, no API key
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=7&lang=en`,
    { signal: AbortSignal.timeout(5000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features ?? [])
    .filter((f: { properties: { type?: string } }) =>
      ["city", "town", "village"].includes(f.properties.type ?? "")
    )
    .slice(0, 7)
    .map((f: { properties: { name: string; country?: string; state?: string } }) => ({
      name: f.properties.name,
      country: f.properties.country ?? "",
      region: f.properties.state,
    }));
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
      } catch {
        setOptions([]);
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
        <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-indigo-400 pointer-events-none" />
        <input
          value={query}
          onChange={handleInput}
          onFocus={() => options.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className={cn("input-dark pl-8", className)}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#8892b0] animate-spin pointer-events-none" />
        )}
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 left-0 right-0 rounded-xl border border-[#1e2540] bg-[#131829] shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
          {options.map((city, i) => (
            <li key={`${city.name}-${i}`}>
              <button
                type="button"
                onMouseDown={() => handleSelect(city)}
                className="w-full text-left flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-indigo-600/20 transition-colors border-b border-white/5 last:border-0"
              >
                <MapPin className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="text-white font-medium">{city.name}</span>
                {(city.region || city.country) && (
                  <span className="text-[#8892b0] text-xs ml-auto shrink-0">
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
