"use client";

/**
 * Typed React Query hooks wrapping the API client.
 * Gives caching, retries, loading/error states, and dedup for free.
 */
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useForexRates() {
  return useQuery({
    queryKey: ["forex"],
    queryFn: api.getForexRates,
    staleTime: 5 * 60 * 1000,
  });
}

export function useWeather(city: string, enabled = true) {
  return useQuery({
    queryKey: ["weather", city],
    queryFn: () => api.getWeather({ city }),
    enabled: enabled && city.trim().length > 1,
    staleTime: 10 * 60 * 1000,
  });
}

export function useBestTime(destination: string, enabled = true) {
  return useQuery({
    queryKey: ["best-time", destination],
    queryFn: () => api.bestTime(destination),
    enabled: enabled && destination.trim().length > 1,
    staleTime: 60 * 60 * 1000,
  });
}

export function useCurrencyConvert() {
  return useMutation({
    mutationFn: ({ amount, from, to }: { amount: number; from: string; to: string }) =>
      api.convertCurrency(amount, from, to),
  });
}

export function useExtractCosts() {
  return useMutation({
    mutationFn: ({ itinerary, currency }: { itinerary: string; currency?: string }) =>
      api.extractCosts(itinerary, currency),
  });
}

export function useOptimizeRoute() {
  return useMutation({
    mutationFn: (stops: { city: string; lat: number; lng: number }[]) =>
      api.optimizeRoute(stops),
  });
}

export function usePredictCash() {
  return useMutation({
    mutationFn: (body: Parameters<typeof api.predictCash>[0]) => api.predictCash(body),
  });
}
