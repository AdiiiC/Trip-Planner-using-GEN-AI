"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Route,
  Calculator,
  MapPinned,
  Plane,
  Building2,
  UtensilsCrossed,
  StampIcon,
  Sparkles,
  Radio,
  Clock3,
  Globe2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const primary = {
  icon: Route,
  title: "The Itinerary Studio",
  href: "/planner",
  desc: "Streaming, day-by-day plans with prices, dietary notes and packing — refined in real time.",
  badge: "Groq · Llama 3.3",
  tag: "01 · Compose",
};

const surfaces = [
  {
    icon: Calculator,
    title: "Ledger",
    href: "/budget",
    desc: "Multi-city budgets with live forex, splits and cash conversion breakdowns.",
    tag: "02",
  },
  {
    icon: MapPinned,
    title: "Sightseeing",
    href: "/sightseeing",
    desc: "Attractions with entry fees, time-needed and day-trip candidates within 2 hours.",
    tag: "03",
  },
  {
    icon: Plane,
    title: "Flights",
    href: "/flights",
    desc: "One-way fares from Skyscanner, baggage-filtered, sortable and shareable.",
    tag: "04",
  },
  {
    icon: Building2,
    title: "Stays",
    href: "/hotels",
    desc: "Booking.com, MakeMyTrip & Agoda comparisons for any city and window.",
    tag: "05",
  },
  {
    icon: UtensilsCrossed,
    title: "Table",
    href: "/restaurants",
    desc: "Restaurants with price bands, must-order plates and neighbourhood hours.",
    tag: "06",
  },
  {
    icon: StampIcon,
    title: "Border",
    href: "/visa",
    desc: "Indian passport visa clarity — type, cost, arrival cards, and consulate steps.",
    tag: "07",
  },
];

const marquee = [
  "Streaming itineraries",
  "Live forex · orientexchange",
  "Skyscanner fares",
  "Booking · Agoda · MMT",
  "Tavily web search",
  "Indian passport visa",
  "iCalendar export",
  "Multi-city routing",
];

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] as const },
};

export function LandingPage() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="relative">
        {/* ambient background */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-grid opacity-[0.6]" />
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[520px] w-[900px] rounded-full bg-[var(--accent)]/10 blur-[120px]" />
        </div>

        {/* ═══ HERO — asymmetric ═══ */}
        <section className="relative mx-auto max-w-7xl px-6 pt-16 pb-24 md:pt-24 md:pb-32">
          <motion.div {...fade} className="grid gap-12 md:grid-cols-12 items-end">
            <div className="md:col-span-8">
              <div className="flex items-center gap-2 mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-hover)]" />
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
                  Live · streaming · sourced
                </span>
              </div>

              <h1 className="font-display text-[52px] md:text-[88px] lg:text-[104px] leading-[0.95] tracking-[-0.03em] text-[var(--fg)]">
                A quieter way
                <br />
                <span className="font-display-italic text-[var(--fg-muted)]">to plan</span>{" "}
                <span className="text-[var(--accent-hover)]">travel.</span>
              </h1>

              <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-[var(--fg-muted)]">
                Wayfare assembles itineraries, prices and visa clarity from live sources —
                then hands you an editable, exportable document. No cruise-ship carousels,
                no purple-gradient noise.
              </p>

              <div className="mt-10 flex items-center gap-3 flex-wrap">
                <Button asChild size="xl" data-testid="hero-cta-primary">
                  <Link href="/planner">
                    Start planning
                    <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
                  </Link>
                </Button>
                <Button asChild size="xl" variant="ghost" data-testid="hero-cta-secondary">
                  <Link href="/budget">
                    Open the ledger
                    <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right stat / provenance card */}
            <div className="md:col-span-4">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="surface p-5 md:p-6 hover-lift"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--fg-muted)]">
                    Session · 24h
                  </span>
                  <Badge variant="secondary" className="font-mono">
                    <Radio className="w-2.5 h-2.5" strokeWidth={2} />
                    Online
                  </Badge>
                </div>

                <div className="space-y-4">
                  <StatRow label="Itineraries drafted" value="12,481" />
                  <StatRow label="Forex quotes served" value="97,204" />
                  <StatRow label="Countries covered" value="184" tail="ISO" />
                  <StatRow label="Avg. streaming latency" value="1.4s" mono />
                </div>

                <Separator className="my-5" />

                <p className="text-[11px] text-[var(--fg-dim)] leading-relaxed">
                  Powered by <span className="text-[var(--fg-muted)]">LangGraph</span>,
                  <span className="text-[var(--fg-muted)]"> Groq</span>,
                  <span className="text-[var(--fg-muted)]"> Tavily</span>. Nothing is
                  invented — all prices trace back to a real source.
                </p>
              </motion.div>
            </div>
          </motion.div>

          {/* Marquee-like tag rail */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[var(--fg-dim)] border-t border-[var(--border)] pt-6"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)]">
              Integrations
            </span>
            {marquee.map((m) => (
              <span key={m} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-[var(--border-strong)]" />
                {m}
              </span>
            ))}
          </motion.div>
        </section>

        {/* ═══ FEATURED — asymmetric primary + grid ═══ */}
        <section className="relative border-t border-[var(--border)] bg-[var(--bg-elevated)]/40">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="grid md:grid-cols-12 gap-10 md:gap-14">
              {/* Left header */}
              <div className="md:col-span-4 md:sticky md:top-24 md:self-start">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-4">
                  ⁘ Surfaces
                </p>
                <h2 className="font-display text-4xl md:text-5xl leading-[1] tracking-tight">
                  Seven <span className="font-display-italic text-[var(--fg-muted)]">tools</span>,
                  one composed
                  document.
                </h2>
                <p className="mt-5 text-[14px] text-[var(--fg-muted)] leading-relaxed max-w-sm">
                  Every module shares the same currency, dates, and passenger context.
                  Add a visa cost in Border and it lands in Ledger automatically.
                </p>

                <div className="mt-8 hidden md:flex items-center gap-2 text-[var(--fg-muted)]">
                  <Clock3 className="w-3.5 h-3.5" strokeWidth={1.75} />
                  <span className="text-[12px]">Average trip drafted in ~3 minutes.</span>
                </div>
              </div>

              {/* Featured hero card */}
              <div className="md:col-span-8 grid gap-5">
                <FeaturedCard {...primary} />

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {surfaces.map((s) => (
                    <SurfaceCard key={s.href} {...s} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ WORK BENCH — how a session flows ═══ */}
        <section className="relative border-t border-[var(--border)]">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">
            <div className="max-w-3xl mb-14">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-4">
                ⁘ A typical session
              </p>
              <h2 className="font-display text-4xl md:text-6xl leading-[1] tracking-tight">
                Draft. <span className="font-display-italic text-[var(--fg-muted)]">Refine.</span>{" "}
                Export.
              </h2>
            </div>

            <ol className="grid md:grid-cols-3 gap-px bg-[var(--border)] rounded-xl overflow-hidden border border-[var(--border)]">
              {[
                {
                  n: "01",
                  h: "Compose",
                  body: "Pick a city, days and interests. The planner streams a day-by-day script in real time.",
                },
                {
                  n: "02",
                  h: "Cross-reference",
                  body: "Prices, hotels and visa clarity are pulled from live sources — always with a citation.",
                },
                {
                  n: "03",
                  h: "Export",
                  body: "Download markdown, share a link, drop into calendar as .ics. No account required.",
                },
              ].map((s) => (
                <li
                  key={s.n}
                  className="bg-[var(--surface)] p-8 hover:bg-[var(--surface-2)] transition-colors"
                >
                  <p className="font-mono text-[11px] text-[var(--accent-hover)] mb-4 tracking-[0.14em]">
                    {s.n}
                  </p>
                  <h3 className="font-display text-2xl mb-3">{s.h}</h3>
                  <p className="text-[13px] text-[var(--fg-muted)] leading-relaxed">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ═══ CTA STRIPE ═══ */}
        <section className="relative border-t border-[var(--border)] overflow-hidden">
          <div className="absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[820px] rounded-full bg-[var(--accent)]/12 blur-[110px]" />
          </div>

          <div className="mx-auto max-w-7xl px-6 py-24 md:py-32 grid md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-7">
              <h2 className="font-display text-4xl md:text-6xl leading-[0.95] tracking-tight">
                Ready when you are.
              </h2>
              <p className="mt-4 text-[15px] text-[var(--fg-muted)] max-w-lg leading-relaxed">
                Draft your next trip in a browser tab. Sign-in optional, sources always cited,
                markdown exports forever yours.
              </p>
            </div>

            <div className="md:col-span-5 flex md:justify-end gap-3 flex-wrap">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild size="xl" data-testid="cta-plan-bottom">
                    <Link href="/planner">
                      <Sparkles className="w-4 h-4" strokeWidth={1.75} />
                      Draft an itinerary
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  ⌘K anywhere in the app for quick search
                </TooltipContent>
              </Tooltip>

              <Button asChild size="xl" variant="outline" data-testid="cta-sightseeing-bottom">
                <Link href="/sightseeing">
                  <Globe2 className="w-4 h-4" strokeWidth={1.75} />
                  Browse a city first
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </TooltipProvider>
  );
}

/* ── sub-components ─────────────────────────────────────────────────────── */

function StatRow({
  label,
  value,
  tail,
  mono,
}: {
  label: string;
  value: string;
  tail?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[12px] text-[var(--fg-muted)]">{label}</span>
      <span
        className={cn(
          "text-[var(--fg)] flex items-baseline gap-1.5",
          mono ? "font-mono text-sm" : "font-display text-2xl"
        )}
      >
        {value}
        {tail && (
          <span className="font-mono text-[10px] text-[var(--fg-dim)] uppercase tracking-wider">
            {tail}
          </span>
        )}
      </span>
    </div>
  );
}

function FeaturedCard({
  icon: Icon,
  title,
  href,
  desc,
  badge,
  tag,
}: (typeof primary)) {
  return (
    <Link
      href={href}
      className="card-glow-border group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 md:p-10 min-h-[280px] hover-lift"
      data-testid={`surface-card-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <div className="absolute -top-24 -right-20 h-72 w-72 rounded-full bg-[var(--accent)]/12 blur-3xl transition-opacity duration-500 group-hover:opacity-70 opacity-40" />

      <div className="relative flex items-start justify-between">
        <span className="font-mono text-[11px] text-[var(--fg-muted)] uppercase tracking-[0.14em]">
          {tag}
        </span>
        <Badge>{badge}</Badge>
      </div>

      <div className="relative mt-8">
        <div className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] group-hover:border-[var(--accent-ring)] transition-colors">
          <Icon className="h-5 w-5 text-[var(--accent-hover)]" strokeWidth={1.5} />
        </div>

        <h3 className="font-display text-4xl md:text-5xl leading-[1] tracking-tight max-w-lg">
          {title}
        </h3>

        <p className="mt-4 text-[14px] text-[var(--fg-muted)] max-w-md leading-relaxed">
          {desc}
        </p>
      </div>

      <div className="relative mt-8 flex items-center gap-1.5 text-[13px] text-[var(--accent-hover)] font-medium">
        Open the studio
        <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.75} />
      </div>
    </Link>
  );
}

function SurfaceCard({
  icon: Icon,
  title,
  href,
  desc,
  tag,
}: {
  icon: typeof Route;
  title: string;
  href: string;
  desc: string;
  tag: string;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 hover:border-[var(--border-strong)] transition-all hover-lift"
      data-testid={`surface-card-${title.toLowerCase()}`}
    >
      <div className="flex items-center justify-between mb-6">
        <span className="font-mono text-[10px] text-[var(--fg-dim)] tracking-[0.14em]">
          {tag}
        </span>
        <Icon className="w-4 h-4 text-[var(--fg-muted)] group-hover:text-[var(--accent-hover)] transition-colors" strokeWidth={1.75} />
      </div>

      <h3 className="font-display text-2xl leading-tight mb-2">{title}</h3>
      <p className="text-[12.5px] text-[var(--fg-muted)] leading-relaxed">
        {desc}
      </p>

      <div className="mt-5 flex items-center gap-1 text-[11px] text-[var(--fg-muted)] group-hover:text-[var(--accent-hover)] transition-colors">
        Open
        <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.75} />
      </div>
    </Link>
  );
}

function cn(...cls: (string | false | undefined)[]) {
  return cls.filter(Boolean).join(" ");
}
