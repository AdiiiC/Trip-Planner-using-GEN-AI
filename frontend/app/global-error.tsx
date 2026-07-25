"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0c0f1a", color: "#e8eaf6", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 400 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#8892b0", fontSize: "0.875rem", marginBottom: 24 }}>
            {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
          </p>
          <button
            onClick={reset}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#6366f1", color: "#fff", border: "none",
              borderRadius: 12, padding: "0.6rem 1.25rem",
              fontSize: "0.875rem", cursor: "pointer", fontWeight: 600,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
