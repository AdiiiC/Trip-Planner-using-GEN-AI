import type { CashItem } from "@/lib/types";

export interface ExchangePlanInput {
  destination: string;
  currency: string;
  usd_amount: number;
  rate_per_usd: number;
  rate_source: string;
  rate_checked_at: string;
}

export interface CashPlanFormData {
  physical_usd_cash: number;
  usd_notes_100: number;
  usd_notes_50: number;
  exchange_plan: ExchangePlanInput[];
}

export interface CashCommitment {
  name: string;
  currency: string;
  amount: number;
  kind: "sightseeing" | "extra";
}

export interface CashPlanStop extends ExchangePlanInput {
  usd_notes_100: number;
  usd_notes_50: number;
  notes_cover_exchange: boolean;
  arrival_cash: number;
  local_from_usd: number;
  local_total: number;
  committed_local: number;
  immediate_extras_local: number;
  available_after_commitments: number;
  break_even_rate: number;
  projected_saving_inr: number;
  rate_status: "good" | "acceptable" | "poor" | "unknown";
}

export interface CashPlanNotice {
  tone: "good" | "warn" | "danger" | "info";
  text: string;
}

export interface CashPlanSummary {
  physical_usd_cash: number;
  forex_card_usd: number;
  exchange_total_usd: number;
  reserve_usd: number;
  usd_notes_100: number;
  usd_notes_50: number;
  reserve_notes_100: number;
  reserve_notes_50: number;
  note_value_usd: number;
  stops: CashPlanStop[];
  projected_saving_inr: number;
  notices: CashPlanNotice[];
}

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const positive = (value: number) => Math.max(finite(value), 0);
const code = (value: string) => value.trim().toUpperCase();

function takeUsdNotes(amount: number, available: { hundreds: number; fifties: number }) {
  let remaining = positive(amount);
  const hundreds = Math.min(Math.floor(remaining / 100), available.hundreds);
  remaining -= hundreds * 100;
  const fifties = Math.min(Math.floor(remaining / 50), available.fifties);
  remaining -= fifties * 50;
  available.hundreds -= hundreds;
  available.fifties -= fifties;
  return { hundreds, fifties, covered: remaining < 0.01 };
}

export function suggestedUsdNotes(amount: number): { hundreds: number; fifties: number } {
  const rounded = Math.floor(positive(amount) / 50) * 50;
  const hundreds = Math.floor((rounded * 0.8) / 100);
  return { hundreds, fifties: Math.floor((rounded - hundreds * 100) / 50) };
}

export function buildCashPlan({
  form,
  allocations,
  commitments,
  rates,
  unconverted_usd,
}: {
  form: CashPlanFormData;
  allocations: CashItem[];
  commitments: CashCommitment[];
  rates: Record<string, number>;
  unconverted_usd: number;
}): CashPlanSummary {
  const usdRate = positive(rates.USD);
  const physicalUsd = positive(form.physical_usd_cash);
  const noteValue = Math.floor(positive(form.usd_notes_100)) * 100
    + Math.floor(positive(form.usd_notes_50)) * 50;
  const arrivals = new Map<string, number>();
  allocations.forEach((allocation) => {
    const currency = code(allocation.currency);
    arrivals.set(currency, (arrivals.get(currency) ?? 0) + positive(allocation.foreign_amount));
  });

  const usedArrivalCurrencies = new Set<string>();
  const baseStops = (form.exchange_plan ?? [])
    .filter((stop) => stop.destination.trim() || positive(stop.usd_amount) > 0)
    .map((raw): CashPlanStop => {
      const currency = code(raw.currency);
      const usdAmount = positive(raw.usd_amount);
      const rate = positive(raw.rate_per_usd);
      const localRate = positive(rates[currency]);
      const arrivalCash = usedArrivalCurrencies.has(currency) ? 0 : arrivals.get(currency) ?? 0;
      usedArrivalCurrencies.add(currency);
      const relevant = commitments.filter((item) => code(item.currency) === currency);
      const committed = relevant.reduce((sum, item) => sum + positive(item.amount), 0);
      const immediate = relevant
        .filter((item) => item.kind === "extra")
        .reduce((sum, item) => sum + positive(item.amount), 0);
      const localFromUsd = usdAmount * rate;
      const breakEven = localRate > 0 ? usdRate / localRate : 0;
      const advantage = breakEven > 0 ? rate / breakEven - 1 : 0;
      const rateStatus = breakEven <= 0 || rate <= 0
        ? "unknown"
        : advantage >= 0.005
          ? "good"
          : advantage >= 0
            ? "acceptable"
            : "poor";

      return {
        ...raw,
        usd_notes_100: 0,
        usd_notes_50: 0,
        notes_cover_exchange: false,
        destination: raw.destination.trim() || currency,
        currency,
        usd_amount: usdAmount,
        rate_per_usd: rate,
        arrival_cash: arrivalCash,
        local_from_usd: localFromUsd,
        local_total: arrivalCash + localFromUsd,
        committed_local: committed,
        immediate_extras_local: immediate,
        available_after_commitments: arrivalCash + localFromUsd - committed,
        break_even_rate: breakEven,
        projected_saving_inr: localFromUsd * localRate - usdAmount * usdRate,
        rate_status: rateStatus,
      };
    });

  const exchangeTotal = baseStops.reduce((sum, stop) => sum + stop.usd_amount, 0);
  const reserve = physicalUsd - exchangeTotal;
  const availableNotes = {
    hundreds: Math.floor(positive(form.usd_notes_100)),
    fifties: Math.floor(positive(form.usd_notes_50)),
  };
  const reserveNotes = takeUsdNotes(Math.max(reserve, 0), availableNotes);
  const stops = baseStops.map((stop) => {
    const notes = takeUsdNotes(stop.usd_amount, availableNotes);
    return {
      ...stop,
      usd_notes_100: notes.hundreds,
      usd_notes_50: notes.fifties,
      notes_cover_exchange: notes.covered,
    };
  });
  const notices: CashPlanNotice[] = [];

  if (physicalUsd > positive(unconverted_usd) + 0.01) {
    notices.push({
      tone: "danger",
      text: `Physical USD exceeds the unconverted pocket-money balance by $${(physicalUsd - positive(unconverted_usd)).toFixed(2)}.`,
    });
  }
  if (Math.abs(noteValue - physicalUsd) >= 0.01) {
    notices.push({
      tone: "warn",
      text: `The listed $100/$50 notes total $${noteValue.toFixed(0)}, not $${physicalUsd.toFixed(0)}.`,
    });
  }
  stops.forEach((stop) => {
    if (!stop.notes_cover_exchange) {
      notices.push({
        tone: "warn",
        text: `${stop.destination}'s $${stop.usd_amount.toFixed(0)} exchange cannot be made exactly with the listed notes after protecting the reserve.`,
      });
    }
  });
  if (reserve < 0) {
    notices.push({
      tone: "danger",
      text: `Destination exchanges over-allocate physical USD by $${Math.abs(reserve).toFixed(0)}.`,
    });
  } else if (physicalUsd > 0 && reserve < 100) {
    notices.push({ tone: "warn", text: `Only $${reserve.toFixed(0)} remains as emergency cash.` });
  } else if (reserve >= 100) {
    notices.push({ tone: "good", text: `$${reserve.toFixed(0)} remains unexchanged as emergency cash.` });
  }

  stops.forEach((stop) => {
    if (stop.immediate_extras_local > 0 && stop.arrival_cash >= stop.immediate_extras_local) {
      notices.push({
        tone: "good",
        text: `${stop.destination} arrival cash covers the listed on-arrival extras.`,
      });
    }
    if (stop.committed_local > stop.arrival_cash && stop.rate_per_usd > 0) {
      const minimumUsd = (stop.committed_local - stop.arrival_cash) / stop.rate_per_usd;
      notices.push({
        tone: stop.available_after_commitments >= 0 ? "info" : "danger",
        text: `${stop.destination} needs at least $${Math.ceil(minimumUsd)} exchanged to cover listed commitments.`,
      });
    }
    if (stop.available_after_commitments < 0) {
      notices.push({
        tone: "danger",
        text: `${stop.destination} is short ${Math.ceil(Math.abs(stop.available_after_commitments)).toLocaleString("en-IN")} ${stop.currency}.`,
      });
    }
    if (stop.rate_status === "poor") {
      notices.push({
        tone: "warn",
        text: `${stop.destination}'s planned rate is below the ${stop.break_even_rate.toFixed(2)} ${stop.currency}/USD break-even rate.`,
      });
    }
  });

  if (stops.length === 0) {
    notices.push({ tone: "info", text: "Add destination exchanges to turn this budget into a step-by-step cash plan." });
  }
  notices.push({ tone: "info", text: "Displayed totals can vary by Rs 1 when individual converted lines are rounded." });

  return {
    physical_usd_cash: physicalUsd,
    forex_card_usd: Math.max(positive(unconverted_usd) - physicalUsd, 0),
    exchange_total_usd: exchangeTotal,
    reserve_usd: reserve,
    usd_notes_100: Math.floor(positive(form.usd_notes_100)),
    usd_notes_50: Math.floor(positive(form.usd_notes_50)),
    reserve_notes_100: reserveNotes.hundreds,
    reserve_notes_50: reserveNotes.fifties,
    note_value_usd: noteValue,
    stops,
    projected_saving_inr: stops.reduce((sum, stop) => sum + stop.projected_saving_inr, 0),
    notices,
  };
}