import type { Metadata } from "next";
import { TravelIntelligence } from "@/components/intelligence/TravelIntelligence";

export const metadata: Metadata = {
  title: "Trip Intelligence",
  description: "Compare trip options, test budget scenarios, and uncover readiness, booking, pace, and cost risks.",
};

export default function IntelligencePage() {
  return <TravelIntelligence />;
}