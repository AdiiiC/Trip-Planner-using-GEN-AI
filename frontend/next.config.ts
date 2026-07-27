import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content Security Policy — strict in prod, relaxed for dev (Turbopack HMR, cross-origin preview)
const prodCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://upload.wikimedia.org https://commons.wikimedia.org https://logo.clearbit.com https://images.unsplash.com https://source.unsplash.com",
  "connect-src 'self' https://*.onrender.com https://*.sentry.io https://wft-geo-db.p.rapidapi.com https://photon.komoot.io https://en.wikipedia.org https://app.posthog.com https://us.i.posthog.com",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const devCsp = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss: https: http:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' ws: wss: https: http:",
  "img-src 'self' data: blob: https: http:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-src 'none'",
  "object-src 'none'",
].join("; ");

const cspHeader = isDev ? devCsp : prodCsp;

const nextConfig: NextConfig = {
  // Broad match to allow Next dev cross-origin requests from any preview cluster
  allowedDevOrigins: [
    "*.preview.emergentagent.com",
    "*.preview.emergentcf.cloud",
    "*.emergentcf.cloud",
    "*.emergentagent.com",
    "*.cluster-1.preview.emergentcf.cloud",
    "*.cluster-2.preview.emergentcf.cloud",
    "*.cluster-3.preview.emergentcf.cloud",
    "*.cluster-4.preview.emergentcf.cloud",
    "*.cluster-5.preview.emergentcf.cloud",
    "*.cluster-6.preview.emergentcf.cloud",
    "*.cluster-7.preview.emergentcf.cloud",
    "*.cluster-8.preview.emergentcf.cloud",
    "*.cluster-9.preview.emergentcf.cloud",
    "*.cluster-10.preview.emergentcf.cloud",
    "*.cluster-11.preview.emergentcf.cloud",
    "*.cluster-12.preview.emergentcf.cloud",
    "*.cluster-13.preview.emergentcf.cloud",
    "*.cluster-14.preview.emergentcf.cloud",
    "*.cluster-15.preview.emergentcf.cloud",
    "*.cluster-16.preview.emergentcf.cloud",
    "*.cluster-17.preview.emergentcf.cloud",
    "*.cluster-18.preview.emergentcf.cloud",
    "*.cluster-19.preview.emergentcf.cloud",
    "*.cluster-20.preview.emergentcf.cloud",
    "5f177e3f-87c0-49cd-9cea-b38897ced5db.preview.emergentagent.com",
    "5f177e3f-87c0-49cd-9cea-b38897ced5db.cluster-12.preview.emergentcf.cloud",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [{ key: "Content-Security-Policy", value: cspHeader }],
      },
    ];
  },
};

// Only wrap with Sentry when a DSN is configured; otherwise plain export
// (avoids failing Sentry init breaking hydration on preview envs without keys)
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
export default sentryDsn
  ? withSentryConfig(nextConfig, {
      org: "adithya-c",
      project: "javascript-nextjs",
      silent: !process.env.CI,
      widenClientFileUpload: true,
      webpack: {
        automaticVercelMonitors: true,
        treeshake: { removeDebugLogging: true },
      },
    })
  : nextConfig;
