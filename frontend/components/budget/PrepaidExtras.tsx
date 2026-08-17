"use client";

// Which extras you pay for at home versus on arrival. It matters because only
// on-arrival costs compete for pocket money, so toggling a chip moves money
// between "prepaid" and "free to spend" in the results above.

import { motion } from "framer-motion";
import type { ExtraItem } from "@/lib/types";
import { formatINR, cn } from "@/lib/utils";

export function PrepaidExtras({ items, onToggle, busy }: {
  items: ExtraItem[];
  onToggle: (name: string, prepaid: boolean) => void;
  busy?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="glass rounded-2xl p-4 space-y-1.5"
    >
      <p className="text-xs font-medium text-white">Paid in India before departure</p>
      <p className="text-[10px] text-[var(--fg-muted)]">
        Untick anything you&apos;ll actually pay for on arrival — it then competes for your pocket money.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {items.map((e) => (
          <button
            key={e.name}
            type="button"
            disabled={busy}
            onClick={() => onToggle(e.name, !e.prepaid)}
            aria-pressed={!!e.prepaid}
            className={cn(
              "text-[11px] rounded-full border px-2.5 py-1 transition-colors disabled:opacity-50",
              e.prepaid
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-[var(--border)] text-[var(--fg-muted)] hover:text-white"
            )}
          >
            {e.name} · {formatINR(e.amount_inr)}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
