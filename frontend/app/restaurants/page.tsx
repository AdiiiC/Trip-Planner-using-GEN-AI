import type { Metadata } from "next";
import { RestaurantFinder } from "@/components/restaurants/RestaurantFinder";

export const metadata: Metadata = {
  title: "Restaurant Finder",
  description: "Discover top restaurants with price ranges, must-try dishes, and opening hours for any travel destination.",
  openGraph: { title: "Restaurant Finder | TripMind", description: "Find top restaurants with prices and must-try dishes for any city." },
};

export default function RestaurantsPage() { return <RestaurantFinder />; }
