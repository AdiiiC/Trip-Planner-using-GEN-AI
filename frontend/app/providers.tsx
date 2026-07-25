"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, useEffect } from "react";

// PostHog analytics — only activates when NEXT_PUBLIC_POSTHOG_KEY is set
// Sign up free at https://posthog.com · add key to Vercel env vars
function PostHogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined") return;
    import("posthog-js").then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: true,
        capture_pageleave: true,
        loaded: (ph) => {
          // Respect cookie consent — opt out if declined
          try {
            const consent = localStorage.getItem("cookie_consent");
            if (consent === "declined") ph.opt_out_capturing();
          } catch {}
        },
      });
    });
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={client}>
        <PostHogInit />
        {children}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
