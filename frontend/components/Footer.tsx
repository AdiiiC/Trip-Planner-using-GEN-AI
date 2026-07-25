"use client";

import Link from "next/link";
import { Compass } from "lucide-react";

export function Footer() {
  return (
    <footer
      className="border-t border-[var(--border)] mt-8 no-print"
      data-testid="site-footer"
    >
      <div className="mx-auto max-w-7xl px-6 py-10 grid gap-8 md:grid-cols-[1fr_auto_auto] items-start">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)]">
              <Compass className="h-3.5 w-3.5 text-[var(--accent-hover)]" strokeWidth={1.5} />
            </span>
            <span className="font-display text-xl leading-none">Wayfare</span>
          </div>
          <p className="text-[13px] text-[var(--fg-muted)] max-w-md leading-relaxed">
            AI-assisted trip planning, assembled from live sources.
            <span className="italic font-display-italic"> Always verify before booking.</span>
          </p>
        </div>

        <div className="text-[13px] text-[var(--fg-muted)]">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--fg-dim)] mb-3">Product</p>
          <ul className="space-y-1.5">
            <li><Link href="/planner" className="hover:text-[var(--fg)] transition-colors">Planner</Link></li>
            <li><Link href="/budget" className="hover:text-[var(--fg)] transition-colors">Budget</Link></li>
            <li><Link href="/hotels" className="hover:text-[var(--fg)] transition-colors">Hotels</Link></li>
            <li><Link href="/flights" className="hover:text-[var(--fg)] transition-colors">Flights</Link></li>
          </ul>
        </div>

        <div className="text-[13px] text-[var(--fg-muted)]">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--fg-dim)] mb-3">Legal</p>
          <ul className="space-y-1.5">
            <li><Link href="/privacy" className="hover:text-[var(--fg)] transition-colors">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-[var(--fg)] transition-colors">Terms</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between text-[11px] text-[var(--fg-dim)]">
          <span>© {new Date().getFullYear()} Wayfare · Considered trip planning</span>
          <span className="font-mono">v2.0</span>
        </div>
      </div>
    </footer>
  );
}
