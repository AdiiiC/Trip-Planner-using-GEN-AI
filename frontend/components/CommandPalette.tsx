"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Globe, Calculator, MapPin, Plane, Hotel,
  UtensilsCrossed, ShieldCheck, Command as CommandIcon,
} from "lucide-react";

interface Item {
  label: string;
  href: string;
  icon: React.ElementType;
  keywords: string;
}

const ITEMS: Item[] = [
  { label: "Trip Planner",   href: "/planner",     icon: Globe,           keywords: "itinerary plan ai generate multi city" },
  { label: "Budget",         href: "/budget",      icon: Calculator,      keywords: "cost money forex currency split" },
  { label: "Sightseeing",    href: "/sightseeing", icon: MapPin,          keywords: "attractions things to do places" },
  { label: "Flights",        href: "/flights",     icon: Plane,           keywords: "flight airline ticket skyscanner price" },
  { label: "Hotels",         href: "/hotels",      icon: Hotel,           keywords: "stay accommodation booking room" },
  { label: "Restaurants",    href: "/restaurants", icon: UtensilsCrossed, keywords: "food eat dining cuisine" },
  { label: "Visa Checker",   href: "/visa",        icon: ShieldCheck,     keywords: "visa passport entry requirements" },
];

/** ⌘K / Ctrl-K command palette for instant navigation. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ITEMS;
    return ITEMS.filter(
      (i) => i.label.toLowerCase().includes(q) || i.keywords.includes(q)
    );
  }, [query]);

  useEffect(() => setActive(0), [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg mx-4 glass rounded-2xl overflow-hidden border border-[#1e2540] shadow-2xl"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2540]">
              <Search className="w-4 h-4 text-[#8892b0]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                  if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  if (e.key === "Enter" && results[active]) go(results[active].href);
                }}
                placeholder="Jump to…"
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-[#8892b0]"
              />
              <kbd className="text-[10px] text-[#8892b0] border border-[#1e2540] rounded px-1.5 py-0.5">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto py-2">
              {results.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-[#8892b0]">No results</p>
              )}
              {results.map((item, i) => (
                <button
                  key={item.href}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item.href)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                    i === active ? "bg-indigo-600/20 text-white" : "text-[#8892b0] hover:bg-white/5"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t border-[#1e2540] text-[10px] text-[#8892b0]">
              <span className="flex items-center gap-1"><CommandIcon className="w-3 h-3" /> K to toggle</span>
              <span>↑↓ navigate · ↵ open</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
