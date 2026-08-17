"use client";

// Client-side PDF generation for a calculated budget. Imported lazily so
// @react-pdf/renderer stays out of the main bundle.

import {
  Document, Page, Text, View, StyleSheet, pdf,
} from "@react-pdf/renderer";
import type { BudgetResult } from "@/lib/types";

const inr = (n: number) => `Rs ${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
const usd = (n: number) => `$${n.toFixed(2)}`;

const C = {
  fg: "#111827", muted: "#6b7280", line: "#e5e7eb", accent: "#047857",
  band: "#f3f4f6", indigo: "#4338ca",
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: C.fg, fontFamily: "Helvetica" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: C.muted, marginTop: 2 },
  meta: { fontSize: 8, color: C.muted, marginTop: 6 },
  grandBox: { marginTop: 14, marginBottom: 8, padding: 12, backgroundColor: C.band, borderRadius: 6 },
  grandLabel: { fontSize: 8, color: C.muted, textTransform: "uppercase", letterSpacing: 1 },
  grand: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 2 },
  grandSub: { fontSize: 8, color: C.muted, marginTop: 2 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, color: C.fg },
  subTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 6, marginBottom: 3, color: C.muted },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: C.line },
  cellL: { flex: 1 },
  cellM: { width: 90, color: C.muted },
  cellR: { width: 80, textAlign: "right" },
  totalRow: { flexDirection: "row", paddingVertical: 4, marginTop: 2, borderTopWidth: 1, borderTopColor: C.fg },
  bold: { fontFamily: "Helvetica-Bold" },
  accent: { color: C.accent, fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: C.muted, borderTopWidth: 0.5, borderTopColor: C.line, paddingTop: 6 },
});

function Line({ l, m, r, boldRow }: { l: string; m?: string; r: string; boldRow?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.cellL, boldRow ? s.bold : {}]}>{l}</Text>
      <Text style={s.cellM}>{m ?? ""}</Text>
      <Text style={[s.cellR, boldRow ? s.bold : {}]}>{r}</Text>
    </View>
  );
}

function Total({ l, r }: { l: string; r: string }) {
  return (
    <View style={s.totalRow}>
      <Text style={[s.cellL, s.bold]}>{l}</Text>
      <Text style={s.cellM}></Text>
      <Text style={[s.cellR, s.bold]}>{r}</Text>
    </View>
  );
}

function BudgetDoc({ result, title }: { result: BudgetResult; title: string }) {
  const fc = result.fixed_costs;
  const cc = result.cash_conversion;
  const gt = result.grand_total;
  // Absent from results computed by a backend that predates these fields.
  const { trip, target, settlement } = result;
  const now = new Date().toLocaleString();

  return (
    <Document title={title}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.sub}>Trip Budget · Per-person share · Cash conversion breakdown</Text>
        <Text style={s.meta}>Travelers: {result.travelers}   ·   Generated: {now}   ·   Wayfare</Text>

        <View style={s.grandBox}>
          <Text style={s.grandLabel}>Grand Total (Your Share)</Text>
          <Text style={s.grand}>{inr(gt.inr)}</Text>
          <Text style={s.grandSub}>~ {usd(gt.usd)}   ·   Prepaid {inr(gt.prepaid_inr)} + Pocket money {inr(gt.pocket_money_inr)}</Text>
        </View>

        {/* Fixed costs */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>1. Fixed Costs</Text>

          <Text style={s.subTitle}>Flights</Text>
          {fc.flights.items.map((f, i) => <Line key={i} l={f.route} m={f.date} r={inr(f.amount_inr)} />)}
          <Line l="Flights subtotal" r={inr(fc.flights.total_inr)} boldRow />

          <Text style={s.subTitle}>Stays</Text>
          {fc.stays.items.map((st, i) => <Line key={i} l={st.destination} m={st.split} r={inr(st.per_person_inr)} />)}
          <Line l="Stays subtotal" r={inr(fc.stays.total_inr)} boldRow />

          <Text style={s.subTitle}>Sightseeing</Text>
          {fc.sightseeing.items.map((sg, i) => <Line key={i} l={sg.name} m={sg.original} r={inr(sg.amount_inr)} />)}
          <Line l="Sightseeing subtotal" r={inr(fc.sightseeing.total_inr)} boldRow />

          <Text style={s.subTitle}>Extras</Text>
          {fc.extras.items.map((ex, i) =>
            <Line key={i} l={`${ex.name}${ex.prepaid ? " (prepaid)" : ""}`} m={ex.original} r={inr(ex.amount_inr)} />)}
          <Line l="Extras subtotal" r={inr(fc.extras.total_inr)} boldRow />

          <Total l="Total Fixed" r={inr(fc.total_inr)} />
          <Line l="  of which prepaid (before departure)" r={inr(fc.prepaid_total_inr)} />
          <Line l="  of which paid on the ground" r={inr(fc.on_ground_total_inr)} />
        </View>

        {/* Cash conversion */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>2. Cash Conversion &amp; Pocket Money</Text>
          <Line l="Pocket money" m={usd(cc.pocket_money_usd)} r={inr(cc.pocket_money_inr)} />
          {cc.allocations.map((a, i) => <Line key={i} l={`  → ${a.display}`} r={inr(a.inr_spent)} />)}
          <Line l="Remaining on USD / forex card" m={usd(cc.usd_forex_remaining_usd)} r={inr(cc.usd_forex_remaining_inr)} />
          <Line l="Already committed (sightseeing + on-arrival extras)" r={inr(cc.committed_inr)} boldRow />
          <Line l="Free to spend" r={inr(cc.free_spend_inr)} boldRow />
        </View>

        {/* Pacing — only when the trip length or a target is known */}
        {trip && (trip.days > 0 || target) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>3. Per Day &amp; Target</Text>
            {trip.days > 0 && (
              <>
                <Line l="Trip length" m={trip.start_date && trip.end_date ? `${trip.start_date} → ${trip.end_date}` : undefined}
                  r={`${trip.nights} nights / ${trip.days} days`} />
                <Line l="All-in per day" r={inr(trip.per_day_all_in_inr)} />
                <Line l="Cash per day (pocket money)" r={inr(trip.per_day_on_ground_inr)} />
                <Line l="Free to spend per day" r={inr(trip.per_day_free_inr)} />
                <Line l="Per night on stays" r={inr(trip.per_night_stay_inr)} />
              </>
            )}
            {target && (
              <>
                <Line l="Budget target" m={target.per_day_inr > 0 ? `${inr(target.per_day_inr)}/day` : undefined}
                  r={inr(target.amount_inr)} />
                <Line
                  l={target.status === "over" ? "Over target by" : "Under target by"}
                  m={`${Math.round(target.pct_used)}% used`}
                  r={inr(Math.abs(target.delta_inr))}
                  boldRow
                />
                {target.crossover_day != null && (
                  <Line l="Running total passes the target on" r={target.crossover_day === 0 ? "departure" : `day ${target.crossover_day}`} />
                )}
              </>
            )}
          </View>
        )}

        {/* Group ledger */}
        {settlement && (
          <View style={s.section} break={settlement.members.length > 8}>
            <Text style={s.sectionTitle}>4. Settle Up ({settlement.party_size} travellers)</Text>
            {settlement.members.map((m) => (
              <Line
                key={m.name}
                l={m.name}
                m={`paid ${inr(m.paid_inr)} · owes ${inr(m.share_inr)}`}
                r={Math.abs(m.net_inr) < 1 ? "square" : m.net_inr > 0 ? `gets ${inr(m.net_inr)}` : `owes ${inr(-m.net_inr)}`}
              />
            ))}
            {settlement.transfers.length > 0 && <Text style={s.subTitle}>Transfers</Text>}
            {settlement.transfers.map((t, i) => (
              <Line key={i} l={`${t.from} → ${t.to}`} r={inr(t.amount_inr)} boldRow />
            ))}
            {settlement.unattributed_inr > 0 && (
              <Line l="Not in the ledger (everyone paid their own)" r={inr(settlement.unattributed_inr)} />
            )}
          </View>
        )}

        <Text style={s.footer}>
          Figures are per person. Grand total = prepaid (flights + stays + prepaid extras) + pocket money; sightseeing and
          on-arrival extras are paid in cash from pocket money and are not double-counted. Generated by Wayfare — always
          verify prices before booking.
        </Text>
      </Page>
    </Document>
  );
}

export async function generateBudgetPdfBlob(result: BudgetResult, title: string): Promise<Blob> {
  return pdf(<BudgetDoc result={result} title={title} />).toBlob();
}
