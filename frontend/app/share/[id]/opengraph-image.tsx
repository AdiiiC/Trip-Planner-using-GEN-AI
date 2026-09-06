import { ImageResponse } from "next/og";
import { API_BASE_URL } from "@/lib/config";

export const runtime = "edge";
export const alt = "Wayfare — Shared Trip";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Share {
  title: string;
  city: string;
  country: string;
  days: number;
}

async function fetchShare(id: string): Promise<Share | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/share/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Share;
  } catch {
    return null;
  }
}

async function fetchCityPhoto(city: string, country: string): Promise<string | null> {
  const qs = new URLSearchParams({ city, ...(country ? { country } : {}) }).toString();
  try {
    const res = await fetch(`${API_BASE_URL}/api/city-photo?${qs}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url ?? null;
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await fetchShare(id);

  const title = share?.title ?? "Wayfare — Shared Trip";
  const city = share?.city ?? "";
  const country = share?.country ?? "";
  const days = share?.days ?? 0;

  const photo = city ? await fetchCityPhoto(city, country) : null;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 64,
          background: "#09090b",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
          <img
            src={photo}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "brightness(0.55)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, transparent 30%, rgba(9,9,11,0.55) 60%, #09090b 100%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#10b981",
              }}
            />
            <span
              style={{
                fontSize: 18,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "#a1a1aa",
              }}
            >
              Wayfare · Shared trip
            </span>
          </div>

          <div
            style={{
              fontSize: 80,
              lineHeight: 1,
              letterSpacing: -2,
              color: "#ffffff",
              maxWidth: 1000,
              display: "flex",
            }}
          >
            {title}
          </div>

          {(city || days > 0) && (
            <div
              style={{
                marginTop: 24,
                fontSize: 28,
                color: "#a1a1aa",
                display: "flex",
                gap: 14,
                alignItems: "center",
              }}
            >
              {days > 0 && <span>{days}-day itinerary</span>}
              {city && days > 0 && <span style={{ opacity: 0.4 }}>·</span>}
              {city && (
                <span style={{ color: "#34d399" }}>
                  {city}
                  {country ? `, ${country}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
