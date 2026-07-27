"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Calendar, Sparkles, ArrowRight, ChevronLeft } from "lucide-react";
import { CityAutocomplete } from "@/components/ui/CityAutocomplete";

const VIBES = [
  { id: "relaxed", label: "Relaxed", emoji: "🧘" },
  { id: "balanced", label: "Balanced", emoji: "⚖️" },
  { id: "adventurous", label: "Adventurous", emoji: "🧗" },
  { id: "family-friendly", label: "Family", emoji: "👨‍👩‍👧" },
];

const BUDGETS = [
  { id: "low", label: "Budget", emoji: "💰" },
  { id: "medium", label: "Mid-range", emoji: "💳" },
  { id: "luxury", label: "Luxury", emoji: "✨" },
];

/**
 * 3-step quick planner wizard for the landing page.
 * Where → When & Vibe → Go!
 * Deep-links into /planner with pre-filled query params.
 */
export function QuickPlanWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [city, setCity] = useState("");
  const [days, setDays] = useState(3);
  const [vibe, setVibe] = useState("balanced");
  const [budget, setBudget] = useState("medium");

  const canProceed = [
    city.trim().length > 0,            // step 0: need a city
    true,                               // step 1: vibe always valid
  ];

  const handleGo = () => {
    const params = new URLSearchParams({
      city,
      days: String(days),
      travel_style: vibe,
      budget,
    });
    router.push(`/planner?${params.toString()}`);
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= step ? "w-6 bg-[var(--accent)]" : "w-2 bg-[var(--border-strong)]"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Where */}
          {step === 0 && (
            <motion.div
              key="where"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
                <MapPin className="w-4 h-4 text-[var(--accent)]" />
                Where do you want to go?
              </div>
              <CityAutocomplete
                value={city}
                onChange={setCity}
                placeholder="Bangkok, Paris, Bali..."
              />
              <div className="flex items-center gap-2 mt-3">
                <label className="text-xs text-[var(--fg-muted)]">Days:</label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={days}
                  onChange={e => setDays(+e.target.value)}
                  className="input-dark w-16 text-center text-sm"
                />
              </div>
            </motion.div>
          )}

          {/* Step 1: Vibe & Budget */}
          {step === 1 && (
            <motion.div
              key="vibe"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--fg)]">
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                What&apos;s your vibe?
              </div>
              <div className="grid grid-cols-2 gap-2">
                {VIBES.map(v => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVibe(v.id)}
                    className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      vibe === v.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {v.emoji} {v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--fg)] mt-2">
                <Calendar className="w-4 h-4 text-[var(--accent)]" />
                Budget?
              </div>
              <div className="grid grid-cols-3 gap-2">
                {BUDGETS.map(b => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBudget(b.id)}
                    className={`px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      budget === b.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    {b.emoji} {b.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Summary + Go */}
          {step === 2 && (
            <motion.div
              key="go"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-3 text-center"
            >
              <Sparkles className="w-8 h-8 text-[var(--accent)] mx-auto" />
              <p className="text-lg font-semibold text-[var(--fg)]">
                {days} days in {city}
              </p>
              <p className="text-sm text-[var(--fg-muted)]">
                {VIBES.find(v => v.id === vibe)?.emoji} {vibe} · {BUDGETS.find(b => b.id === budget)?.emoji} {budget}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : <div />}

          {step < 2 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed[step]}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleGo}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
            >
              Plan my trip <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
