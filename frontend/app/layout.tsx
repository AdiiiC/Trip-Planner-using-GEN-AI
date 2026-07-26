import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageTransition } from "@/components/PageTransition";
import { CookieConsent } from "@/components/CookieConsent";
import { CommandPalette } from "@/components/CommandPalette";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Wayfare — Considered Trip Planning", template: "%s · Wayfare" },
  description:
    "A quieter way to plan travel. Streaming itineraries, live prices, visa clarity — assembled from real sources, presented without noise.",
  keywords: ["trip planner", "AI travel", "itinerary generator", "flight tracker", "budget travel"],
  openGraph: {
    title: "Wayfare — Considered Trip Planning",
    description: "A quieter way to plan travel. Itineraries, prices and visa clarity.",
    type: "website",
    siteName: "Wayfare",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wayfare",
    description: "A quieter way to plan travel.",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,   // allow user zoom (accessibility) but prevent auto-zoom on input focus
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" data-testid="app-body">
        <Providers>
          <CommandPalette />
          <Navbar />
          <ErrorBoundary>
            <main className="flex-1">
              <PageTransition>{children}</PageTransition>
            </main>
            <Footer />
          </ErrorBoundary>
          <CookieConsent />
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontFamily: "var(--font-geist-sans)",
              },
              className: "text-sm",
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
