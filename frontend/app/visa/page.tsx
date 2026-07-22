"use client";

import { VisaCostChecker } from "@/components/visa/VisaCostChecker";

export default function VisaPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-1">Visa Cost Checker</h1>
        <p className="text-[#8892b0]">
          Indian passport · Instant visa type · Cost included in budget · Arrival card reminders
        </p>
      </div>

      {/* Legend */}
      <div className="glass rounded-2xl p-4 mb-6">
        <p className="text-xs font-semibold text-[#8892b0] uppercase tracking-wider mb-3">Visa types</p>
        <div className="grid sm:grid-cols-2 gap-2 text-xs">
          {[
            { emoji: "🟢", type: "Visa Free",              desc: "No visa needed (e.g., Nepal, Bhutan, Maldives)" },
            { emoji: "🟢", type: "Arrival Card Required",  desc: "Free entry but fill digital card (e.g., Thailand TDAC)" },
            { emoji: "🔵", type: "e-Visa",                 desc: "Apply & pay online before travel (e.g., Vietnam, Turkey)" },
            { emoji: "🟡", type: "Visa on Arrival",        desc: "Pay at airport/port (e.g., Indonesia, Cambodia)" },
            { emoji: "🔴", type: "Consulate / Embassy",    desc: "Apply in person before travel (e.g., USA, UK, Schengen)" },
          ].map(r => (
            <div key={r.type} className="flex items-start gap-2">
              <span>{r.emoji}</span>
              <div>
                <span className="font-medium text-white">{r.type}</span>
                <span className="text-[#8892b0] ml-1">— {r.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <VisaCostChecker />
    </div>
  );
}
