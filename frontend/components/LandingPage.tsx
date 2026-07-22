"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Calculator, Globe, Map, Zap, Search, TrendingUp, FileText, Luggage, Plane, Hotel, UtensilsCrossed, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: Globe,
    title: "AI Itinerary Planner",
    desc: "Day-by-day, time-blocked itineraries with costs, tips, and a packing guide — streamed live. Supports multi-city trips.",
    href: "/planner",
    color: "from-indigo-500 to-violet-600",
    badge: "GPT-powered",
  },
  {
    icon: Calculator,
    title: "Trip Budget Calculator",
    desc: "Multi-destination budgets with live forex rates, accommodation splits, and cash conversion breakdown.",
    href: "/budget",
    color: "from-emerald-500 to-teal-600",
    badge: "Multi-currency",
  },
  {
    icon: Map,
    title: "Sightseeing Explorer",
    desc: "Discover top attractions with entry fees, time estimates, and nearby day trips within 2 hours.",
    href: "/sightseeing",
    color: "from-rose-500 to-pink-600",
    badge: "Web-scraped",
  },
  {
    icon: Plane,
    title: "Flight Tracker",
    desc: "One-way prices with check-in baggage filter from Skyscanner.co.in. Search any route.",
    href: "/flights",
    color: "from-sky-500 to-cyan-600",
    badge: "Skyscanner",
  },
  {
    icon: Hotel,
    title: "Hotel Finder",
    desc: "Hotel price suggestions from Booking.com, MakeMyTrip, and Agoda for any city and date.",
    href: "/hotels",
    color: "from-amber-500 to-orange-600",
    badge: "Booking.com",
  },
  {
    icon: UtensilsCrossed,
    title: "Restaurant Finder",
    desc: "Top restaurants with price ranges, must-try dishes, and opening hours for any destination.",
    href: "/restaurants",
    color: "from-fuchsia-500 to-purple-600",
    badge: "Web-sourced",
  },
  {
    icon: ShieldCheck,
    title: "Visa Cost Checker",
    desc: "Indian passport visa requirements for any country — type, cost, arrival card info, auto-adds to budget.",
    href: "/visa",
    color: "from-violet-500 to-indigo-600",
    badge: "Indian passport",
  },
];

const extras = [
  { icon: TrendingUp,       text: "Live forex rates (ExchangeRate-API)" },
  { icon: Search,           text: "Tavily-powered web search" },
  { icon: FileText,         text: "Visa info · Indian passport" },
  { icon: Luggage,          text: "Smart packing list" },
  { icon: Zap,              text: "Streaming output — no waiting" },
  { icon: Plane,            text: "Skyscanner.co.in flight prices" },
  { icon: Hotel,            text: "Hotel prices · Booking / Agoda" },
  { icon: UtensilsCrossed,  text: "Restaurants with price ranges" },
  { icon: Globe,            text: "Multi-city itinerary planning" },
  { icon: ShieldCheck,      text: "Visa checker · costs auto-added to budget" },
  { icon: FileText,         text: "Download itinerary as .md · Share link" },
];

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-grid">
      {/* Glow blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-80 w-80 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute top-60 right-1/4 h-64 w-64 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-600/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-20">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-600/10 px-4 py-1.5 text-xs font-medium text-indigo-300 mb-6">
            <Zap className="w-3.5 h-3.5" />
            Powered by LangGraph + Groq Llama 3.3
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            <span className="gradient-text">Plan smarter trips.</span>
            <br />
            <span className="text-white">Spend less, see more.</span>
          </h1>
          <p className="text-[#8892b0] text-lg max-w-2xl mx-auto leading-relaxed">
            One tool for itinerary planning, budget breakdowns, live forex, and
            sightseeing discovery — all AI-powered.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {features.map((f, i) => (
            <motion.div
              key={f.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
            >
              <Link href={f.href}>
                <div className="group relative glass rounded-2xl p-6 h-full hover:border-indigo-500/40 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                  <div className={`inline-flex p-2.5 rounded-xl bg-gradient-to-br ${f.color} mb-4`}>
                    <f.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="absolute top-4 right-4">
                    <span className="text-[10px] font-medium rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[#8892b0]">
                      {f.badge}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
                  <p className="text-[#8892b0] text-sm leading-relaxed">{f.desc}</p>
                  <div className="mt-4 text-indigo-400 text-sm font-medium group-hover:text-indigo-300 transition-colors">
                    Open →
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Capabilities strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-2xl p-6"
        >
          <p className="text-[#8892b0] text-xs font-semibold uppercase tracking-wider mb-4">
            Built-in capabilities
          </p>
          <div className="flex flex-wrap gap-3">
            {extras.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-[#8892b0]">
                <Icon className="w-3.5 h-3.5 text-indigo-400" />
                {text}
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
