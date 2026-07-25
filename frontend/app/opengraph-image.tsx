import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TripMind — AI Trip Planner";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, var(--bg) 0%, var(--surface-2) 60%, var(--bg) 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          gap: 16,
        }}
      >
        {/* Logo row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 64, color: "#34d399" }}>✈</div>
          <div style={{ fontSize: 72, fontWeight: 800, color: "#34d399", letterSpacing: -2 }}>
            TripMind
          </div>
        </div>

        {/* Tagline */}
        <div style={{ fontSize: 32, color: "var(--fg)", fontWeight: 500 }}>
          AI-Powered Trip Planner
        </div>

        {/* Features strip */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {["Itineraries", "Flights", "Hotels", "Restaurants", "Visa Info", "Budget"].map((f) => (
            <div
              key={f}
              style={{
                fontSize: 18,
                color: "var(--fg-muted)",
                background: "rgba(99,102,241,0.15)",
                border: "1px solid rgba(99,102,241,0.3)",
                borderRadius: 24,
                padding: "6px 18px",
              }}
            >
              {f}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
