import type { Metadata } from "next";
import { VisaPageContent } from "@/components/visa/VisaPageContent";

export const metadata: Metadata = {
  title: "Visa Cost Checker",
  description:
    "Check visa requirements, costs, and processing times for Indian passport holders travelling to any country.",
  openGraph: {
    title: "Visa Cost Checker | TripMind",
    description: "Instant visa requirements and costs for Indian passport holders.",
  },
};

export default function VisaPage() {
  return <VisaPageContent />;
}
