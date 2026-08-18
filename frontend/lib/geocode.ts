/**
 * City geocoding via Photon (free, keyless) plus great-circle distance helpers.
 * Shared by the multi-city route map and the route optimiser.
 */

export interface GeoCity {
  city: string;
  lat: number;
  lng: number;
}

const PHOTON = "https://photon.komoot.io/api/";

/** Resolve city names to coordinates, silently skipping ones that fail. */
export async function geocodeCities(cities: string[]): Promise<GeoCity[]> {
  const out: GeoCity[] = [];
  for (const raw of cities) {
    const city = raw.trim();
    if (!city) continue;
    try {
      const res = await fetch(`${PHOTON}?q=${encodeURIComponent(city)}&limit=1&lang=en`);
      if (!res.ok) continue;
      const data = await res.json();
      const coords = data?.features?.[0]?.geometry?.coordinates;
      if (!Array.isArray(coords)) continue;
      const [lng, lat] = coords;
      if (typeof lat === "number" && typeof lng === "number") out.push({ city, lat, lng });
    } catch {
      // Unresolvable city — omit it rather than failing the whole batch.
    }
  }
  return out;
}

export function haversineKm(a: GeoCity, b: GeoCity): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Total distance of the stops in their current order. */
export function routeDistanceKm(stops: GeoCity[]): number {
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) total += haversineKm(stops[i], stops[i + 1]);
  return total;
}
