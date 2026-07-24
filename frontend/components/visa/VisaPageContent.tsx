"use client";

import { VisaCostChecker } from "@/components/visa/VisaCostChecker";

export function VisaPageContent() {
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
            { color: "bg-emerald-500", type: "Visa Free",             desc: "No visa needed (e.g., Nepal, Bhutan, Maldives)" },
            { color: "bg-teal-500",    type: "Arrival Card Required", desc: "Free entry but fill digital card (e.g., Thailand TDAC)" },
            { color: "bg-sky-500",     type: "e-Visa",                desc: "Apply & pay online before travel (e.g., Vietnam, Turkey)" },
            { color: "bg-amber-500",   type: "Visa on Arrival",       desc: "Pay at airport/port (e.g., Indonesia, Cambodia)" },
            { color: "bg-rose-500",    type: "Consulate / Embassy",   desc: "Apply in person before travel (e.g., USA, UK, Schengen)" },
          ].map(r => (
            <div key={r.type} className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${r.color}`} />
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
