"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Check, Crosshair, Hotel, LoaderCircle, MapPin, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Attraction, GeoPoint, PlaceDistance } from "@/lib/types";
import { cn } from "@/lib/utils";

const attractionIcon = (selected: boolean) => L.divIcon({
  html: `<div style="width:${selected ? 22 : 14}px;height:${selected ? 22 : 14}px;border-radius:50%;background:${selected ? "#10b981" : "#71717a"};border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,.5)"></div>`,
  iconSize: selected ? [22, 22] : [14, 14],
  iconAnchor: selected ? [11, 11] : [7, 7],
  className: "",
});

const hotelIcon = L.divIcon({
  html: `<div style="width:30px;height:30px;border-radius:6px;background:#f59e0b;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.55);display:grid;place-items:center;color:#111;font:bold 15px sans-serif">H</div>`,
  iconSize: [30, 30], iconAnchor: [15, 15], className: "",
});

function MapController({ points }: { points: GeoPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 13);
    else map.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lng])), { padding: [44, 44] });
  }, [map, points]);
  return null;
}

function MapClick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: event => onPick(event.latlng.lat, event.latlng.lng) });
  return null;
}

export function SightseeingMap({ city, attractions }: { city: string; attractions: Attraction[] }) {
  const located = attractions.filter((item): item is Attraction & { coordinates: GeoPoint } => !!item.coordinates);
  const [selected, setSelected] = useState(() => new Set(located.slice(0, 5).map(item => item.name)));
  const [hotel, setHotel] = useState<GeoPoint | null>(null);
  const [hotelQuery, setHotelQuery] = useState("");
  const [matches, setMatches] = useState<GeoPoint[]>([]);
  const [distances, setDistances] = useState<PlaceDistance[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  const selectedAttractions = located.filter(item => selected.has(item.name));

  useEffect(() => {
    const chosen = attractions.filter((item): item is Attraction & { coordinates: GeoPoint } =>
      !!item.coordinates && selected.has(item.name)
    );
    if (!hotel || !chosen.length) return;
    let active = true;
    api.placeDistances(hotel, chosen.map(item => item.coordinates))
      .then(result => active && setDistances(result.distances))
      .catch(() => active && setDistances([]));
    return () => { active = false; };
  }, [hotel, attractions, selected]);

  const searchHotel = async () => {
    if (hotelQuery.trim().length < 2) return;
    setSearching(true);
    try { setMatches(await api.searchPlaces(hotelQuery, city)); }
    finally { setSearching(false); }
  };

  const pickMapHotel = async (lat: number, lng: number) => {
    setLocating(true);
    try {
      const point = await api.reversePlace(lat, lng);
      setHotel({ ...point, name: point.name || "Dropped hotel pin" });
      setHotelQuery(point.name);
      setMatches([]);
    } finally { setLocating(false); }
  };

  const toggle = (name: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const points = [...selectedAttractions.map(item => item.coordinates), ...(hotel ? [hotel] : [])];

  if (!located.length) {
    return <div className="surface p-5 text-sm text-[var(--fg-muted)]">Map locations were not available for this search. The attraction guide is still shown below.</div>;
  }

  return (
    <section className="surface overflow-hidden">
      <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] min-h-[600px]">
        <div className="border-b lg:border-b-0 lg:border-r border-[var(--border)] flex flex-col min-h-0">
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-2 mb-1">
              <Hotel className="w-4 h-4 text-amber-400" />
              <h3 className="font-semibold">Choose your hotel base</h3>
            </div>
            <p className="text-xs text-[var(--fg-muted)] mb-3">Search a hotel or click anywhere on the map to place it.</p>
            <div className="flex gap-2">
              <input value={hotelQuery} onChange={event => setHotelQuery(event.target.value)}
                onKeyDown={event => event.key === "Enter" && searchHotel()}
                placeholder="Hotel or neighbourhood" className="input-dark flex-1 min-w-0" />
              <button onClick={searchHotel} aria-label="Search hotel" className="h-10 w-10 grid place-items-center rounded-md bg-amber-500 text-zinc-950">
                {searching ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </div>
            {matches.length > 0 && (
              <div className="mt-2 border border-[var(--border)] rounded-md overflow-hidden">
                {matches.map(match => (
                  <button key={`${match.lat}-${match.lng}`} onClick={() => { setHotel(match); setHotelQuery(match.name); setMatches([]); }}
                    className="w-full px-3 py-2 text-left hover:bg-[var(--surface-2)] border-b last:border-0 border-[var(--border)]">
                    <span className="block text-xs font-medium">{match.name}</span>
                    <span className="block text-[10px] text-[var(--fg-muted)] truncate">{match.address}</span>
                  </button>
                ))}
              </div>
            )}
            {hotel && (
              <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/25 p-2.5">
                <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0"><p className="text-xs font-medium truncate">{hotel.name}</p><p className="text-[10px] text-[var(--fg-muted)] truncate">{hotel.address || "Custom map location"}</p></div>
              </div>
            )}
          </div>

          <div className="p-4 flex-1 overflow-auto max-h-[360px] lg:max-h-none">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold uppercase text-[var(--fg-muted)]">Places to visit</p>
              <span className="text-[10px] text-emerald-400">{selected.size} selected</span>
            </div>
            <div className="space-y-1.5">
              {located.map(item => {
                const active = selected.has(item.name);
                const distance = hotel && selectedAttractions.length
                  ? distances.find(value => value.destination === item.coordinates.name)
                  : undefined;
                return (
                  <button key={item.name} onClick={() => toggle(item.name)} className={cn(
                    "w-full text-left p-2.5 rounded-md border transition-colors flex gap-2",
                    active ? "border-emerald-500/35 bg-emerald-500/10" : "border-transparent hover:bg-[var(--surface-2)]"
                  )}>
                    <span className={cn("w-4 h-4 mt-0.5 rounded-sm border grid place-items-center shrink-0", active ? "bg-emerald-500 border-emerald-500 text-zinc-950" : "border-[var(--border-strong)]")}>
                      {active && <Check className="w-3 h-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium truncate">{item.name}</span>
                      <span className="block text-[10px] text-[var(--fg-muted)] truncate">{item.location}</span>
                    </span>
                    {distance && <span className="text-right shrink-0"><span className="block text-xs font-medium">{distance.distance_km} km</span><span className="block text-[10px] text-[var(--fg-muted)]">{distance.duration_minutes} min</span></span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative min-h-[420px] lg:min-h-[600px]">
          <MapContainer center={[located[0].coordinates.lat, located[0].coordinates.lng]} zoom={13} scrollWheelZoom className="z-0 h-full min-h-[420px] lg:min-h-[600px] w-full">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <MapController points={points.length ? points : located.map(item => item.coordinates)} />
            <MapClick onPick={pickMapHotel} />
            {located.map(item => (
              <Marker key={item.name} position={[item.coordinates.lat, item.coordinates.lng]} icon={attractionIcon(selected.has(item.name))}>
                <Popup><strong>{item.name}</strong><br />{item.location}<br />{item.entry_cost}</Popup>
              </Marker>
            ))}
            {hotel && <Marker position={[hotel.lat, hotel.lng]} icon={hotelIcon}><Popup><strong>Your hotel</strong><br />{hotel.name}</Popup></Marker>}
          </MapContainer>
          <div className="absolute top-3 right-3 z-[400] rounded-md bg-zinc-950/90 border border-white/15 px-3 py-2 text-[11px] text-zinc-200 flex items-center gap-2 pointer-events-none">
            {locating ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5 text-amber-400" />}
            Click map to set hotel
          </div>
        </div>
      </div>
    </section>
  );
}