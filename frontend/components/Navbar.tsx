"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, Calculator, Map, Plane, Hotel, UtensilsCrossed, ShieldCheck, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const nav = [
  { label: "Planner",     href: "/planner",     icon: Globe },
  { label: "Budget",      href: "/budget",      icon: Calculator },
  { label: "Sightseeing", href: "/sightseeing", icon: Map },
  { label: "Flights",     href: "/flights",     icon: Plane },
  { label: "Hotels",      href: "/hotels",      icon: Hotel },
  { label: "Restaurants", href: "/restaurants", icon: UtensilsCrossed },
  { label: "Visa",        href: "/visa",        icon: ShieldCheck },
];

export function Navbar() {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 glass border-b border-[#1e2540]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-semibold text-white shrink-0">
            <Plane className="w-5 h-5 text-indigo-400" />
            <span className="gradient-text text-lg font-bold">TripMind</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {nav.map(({ label, href, icon: Icon }) => {
              const active = path.startsWith(href);
              return (
                <Link key={href} href={href}>
                  <motion.span
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                        : "text-[#8892b0] hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </motion.span>
                </Link>
              );
            })}
          </nav>

          {/* Right: theme toggle + mobile burger */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 text-[#8892b0] hover:text-white hover:border-white/20 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden overflow-hidden border-t border-[#1e2540]"
            >
              <nav className="flex flex-col p-3 gap-1">
                {nav.map(({ label, href, icon: Icon }) => {
                  const active = path.startsWith(href);
                  return (
                    <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                      <span
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          active
                            ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                            : "text-[#8892b0] hover:text-white hover:bg-white/5"
                        )}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}

