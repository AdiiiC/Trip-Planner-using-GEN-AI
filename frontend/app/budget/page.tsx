import type { Metadata } from "next";
import { BudgetCalculator } from "@/components/budget/BudgetCalculator";
import { CurrencyConverter } from "@/components/ui/CurrencyConverter";

export const metadata: Metadata = {
  title: "Trip Budget Calculator",
  description: "Calculate your trip budget with live forex rates, flight costs, accommodation splits, and cash conversion breakdowns.",
  openGraph: { title: "Trip Budget Calculator | TripMind", description: "Calculate trip budgets with live forex, flights, hotels, and cash conversion." },
};

export default function BudgetPage() {
  return (
    <>
      <BudgetCalculator />
      <div className="max-w-7xl mx-auto px-4 pb-12 space-y-6">
        <CurrencyConverter />
      </div>
    </>
  );
}
