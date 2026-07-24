import type { Metadata } from "next";
import { BudgetCalculator } from "@/components/budget/BudgetCalculator";

export const metadata: Metadata = {
  title: "Trip Budget Calculator",
  description: "Calculate your trip budget with live forex rates, flight costs, accommodation splits, and cash conversion breakdowns.",
  openGraph: { title: "Trip Budget Calculator | TripMind", description: "Calculate trip budgets with live forex, flights, hotels, and cash conversion." },
};

export default function BudgetPage() {
  return <BudgetCalculator />;
}
