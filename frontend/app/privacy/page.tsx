import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How TripMind handles your data — we keep it minimal and local.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
      <p className="text-[var(--fg-muted)] text-sm mb-8">Last updated: July 2026</p>

      <div className="space-y-8 prose-trip text-sm leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold text-[var(--fg)] mb-2">1. What TripMind does</h2>
          <p className="text-[var(--fg-muted)]">TripMind is an AI-powered travel planning tool. It generates itineraries, searches for flight and hotel prices, checks visa requirements, and finds restaurants and sightseeing options. No user accounts are required.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--fg)] mb-2">2. Data we collect</h2>
          <p className="text-[var(--fg-muted)] mb-2">We collect <strong className="text-white">no personal data</strong>. Specifically:</p>
          <ul className="text-[var(--fg-muted)] space-y-1 list-disc pl-5">
            <li>No name, email, or account information</li>
            <li>No payment information</li>
            <li>No location data</li>
            <li>Your search queries (city names, dates, preferences) are sent to our backend to generate results — they are not stored on our servers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--fg)] mb-2">3. Browser storage</h2>
          <p className="text-[var(--fg-muted)] mb-2">The following data is stored <strong className="text-white">only in your browser</strong> (never sent to us):</p>
          <ul className="text-[var(--fg-muted)] space-y-1 list-disc pl-5">
            <li><strong className="text-white">localStorage</strong>: saved trip history, recently searched cities, cookie consent preference, theme (dark/light)</li>
            <li><strong className="text-white">sessionStorage</strong>: cached API results (flights, hotels, restaurants) for 10 minutes to reduce redundant requests</li>
          </ul>
          <p className="text-[var(--fg-muted)] mt-2">You can clear all of this at any time via your browser&apos;s &quot;Clear site data&quot; setting.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--fg)] mb-2">4. Third-party services</h2>
          <p className="text-[var(--fg-muted)] mb-2">Your queries are processed by the following third-party services:</p>
          <ul className="text-[var(--fg-muted)] space-y-1 list-disc pl-5">
            <li><strong className="text-white">Groq</strong> — AI inference (your trip details are sent to generate itineraries)</li>
            <li><strong className="text-white">Serper.dev</strong> — Google Search API (flight, hotel, visa queries)</li>
            <li><strong className="text-white">Exa</strong> — Neural web search (restaurant and sightseeing queries)</li>
            <li><strong className="text-white">Sentry</strong> — Error monitoring (anonymous error reports, no user data)</li>
            <li><strong className="text-white">Vercel</strong> — Frontend hosting (standard server logs with IP addresses, retained per Vercel&apos;s policy)</li>
            <li><strong className="text-white">Render</strong> — Backend hosting (standard server logs)</li>
            <li><strong className="text-white">Wikipedia</strong> — Destination images fetched directly in your browser</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--fg)] mb-2">5. Cookies</h2>
          <p className="text-[var(--fg-muted)]">TripMind does not set any tracking cookies. We use only browser localStorage and sessionStorage (not cookies) for local preferences. Vercel and Sentry may set technical cookies per their own policies.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--fg)] mb-2">6. Your rights</h2>
          <p className="text-[var(--fg-muted)]">Since we store no personal data on our servers, there is nothing for us to delete or export on your behalf. All locally stored data can be cleared via your browser settings.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--fg)] mb-2">7. Changes</h2>
          <p className="text-[var(--fg-muted)]">We may update this policy. The &quot;last updated&quot; date at the top will reflect any changes.</p>
        </section>

      </div>
    </div>
  );
}
