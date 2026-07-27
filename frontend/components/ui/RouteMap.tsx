"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default marker icons (Leaflet CSS path issue in bundlers)
const defaultIcon = L.divIcon({
  html: `<div style="width:12px;height:12px;border-radius:50%;background:var(--accent,#10b981);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  className: "",
});

interface Stop {
  city: string;
  lat: number;
  lng: number;
}

interface Props {
  stops: Stop[];
  className?: string;
}

function FitBounds({ stops }: { stops: Stop[] }) {
  const map = useMap();
  useEffect(() => {
    if (stops.length < 2) return;
    const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, stops]);
  return null;
}

export function RouteMap({ stops, className = "" }: Props) {
  if (stops.length < 2) return null;

  const center: [number, number] = [
    stops.reduce((s, p) => s + p.lat, 0) / stops.length,
    stops.reduce((s, p) => s + p.lng, 0) / stops.length,
  ];

  const polyline: [number, number][] = stops.map(s => [s.lat, s.lng]);

  return (
    <div className={`rounded-xl overflow-hidden border border-[var(--border)] ${className}`}>
      <MapContainer
        center={center}
        zoom={4}
        scrollWheelZoom={false}
        style={{ height: "260px", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds stops={stops} />
        <Polyline
          positions={polyline}
          pathOptions={{ color: "var(--accent, #10b981)", weight: 3, dashArray: "8 4" }}
        />
        {stops.map((stop, i) => (
          <Marker key={i} position={[stop.lat, stop.lng]} icon={defaultIcon}>
            <Popup>
              <span className="font-medium text-sm">{i + 1}. {stop.city}</span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
