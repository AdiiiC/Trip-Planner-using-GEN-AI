import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { CookieConsent } from "@/components/CookieConsent";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "TripMind — AI Trip Planner", template: "%s | TripMind" },
  description:
    "Plan smarter trips with AI. Streaming itineraries, live flight prices, hotel finders, visa checks, and budget breakdowns — all in one place.",
  keywords: ["trip planner", "AI travel", "itinerary generator", "flight tracker", "budget travel"],
  openGraph: {
    title: "TripMind — AI Trip Planner",
    description: "Plan smarter trips with AI-powered itineraries, live prices, and visa info.",
    type: "website",
    siteName: "TripMind",
  },
  twitter: {
    card: "summary_large_image",
    title: "TripMind — AI Trip Planner",
    description: "Plan smarter trips with AI-powered itineraries, live prices, and visa info.",
  },
  manifest: "/manifest.json",
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-[#0c0f1a]">
        <Providers>
          <Navbar />
          <ErrorBoundary>
            <main className="flex-1">
              <PageTransition>{children}</PageTransition>
            </main>
            <footer className="border-t border-[#1e2540] py-4 no-print">
              <div className="max-w-7xl mx-auto px-4 flex items-center justify-between flex-wrap gap-2 text-xs text-[#8892b0]">
                <span>© {new Date().getFullYear()} TripMind. AI-generated content — always verify before booking.</span>
                <div className="flex gap-4">
                  <a href="/privacy" className="hover:text-indigo-400 transition-colors">Privacy</a>
                  <a href="/terms" className="hover:text-indigo-400 transition-colors">Terms</a>
                </div>
              </div>
            </footer>
          </ErrorBoundary>
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
