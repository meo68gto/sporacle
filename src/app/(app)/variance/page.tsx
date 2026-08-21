import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { DateBasisBadge } from "@/components/DateBasisBadge";
import { getDb } from "@/lib/runtime";
import { activeFacts } from "@/lib/queries/facts";
import { varianceLines, type VarianceLine } from "@/lib/reconciliation/variance";
import { source } from "@/db/schema";
import { fromCents, toDisplay } from "@/lib/money";

/**
 * Variance ledger (design spec §3.2). Five measures of one day's money —
 * five different questions, never candidates for averaging (§2 CLAUDE.md:
 * "Do not force"). Pairwise deltas are display-only annotations in cents:
 * they are never Measure arithmetic (I2) and never a reconciliation. The
 * one cross-basis row is shown only to close the matrix and says so.
 */

const HEADING_FONT: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.1,
};

// Standing explanations link each delta to its open hypothesis — the delta
// is an annotation, not a computation result (I2).
const DELTA_ROWS: Array<{ a: string; b: string; explanation: string; crossBasis?: boolean }> = [
  { a: "D3", b: "D1", explanation: "H4 — the narrowest measure: closed plus the one still-booked equals D1 exactly." },
  { a: "D1", b: "D4", explanation: "H3 — services outnumber appointments: one appointment likely carried two services." },
  { a: "D1", b: "D2", explanation: "H2 — POS is wider than appointments: retail, gratuity and gift cards ride along." },
  {
    a: "D1",
    b: "D5",
    explanation: "Different date basis. This subtraction has no meaning — shown only to close the matrix.",
    crossBasis: true,
  },
];

function basisCell(line: VarianceLine) {
  if (line.dateBasis === "transaction_date") {
    return <DateBasisBadge basis="transaction_date" inline />;
  }
  return <>{line.dateBasis.replace(/_/g, " ")}</>;
}

export default async function VariancePage() {
  const db = await getDb();
  const all = await activeFacts(db);

  // Business day: latest date with a D1 money total delivered.
  const day =
    all
      .filter((f) => f.measureKey === "appt_value_by_hour" && f.isTotalRow)
      .map((f) => f.businessDate)
      .sort()
      .at(-1) ?? null;
  const lines = day ? varianceLines(all, day) : [];
  const byKey = new Map(lines.map((l) => [l.sourceKey, l]));

  const sources = await db.select({ key: source.key, grain: source.grain }).from(source);
  const grainOf = (key: string) => sources.find((s) => s.key === key)?.grain ?? "unknown";

  const comparableIsh = ["D1", "D2", "D3", "D4"]
    .map((k) => byKey.get(k))
    .filter((l): l is VarianceLine => Boolean(l));
  const d5 = byKey.get("D5");

  // D5 sub-line detail — counts by channel from the same source (I2-legal).
  const bookingCounts = day
    ? all.filter((f) => f.measureKey === "booking_count_by_source" && f.businessDate === day)
    : [];
  const channelCount = (v: string) =>
    bookingCounts.find((f) => f.dimensionType === "source" && f.dimensionValue === v)?.valueNumeric;
  const bookingTotalCount = bookingCounts.find((f) => f.isTotalRow)?.valueNumeric;

  return (
    <>
      <PageHeader
        kicker={day ? `Reconciliation · business date ${day}` : "Reconciliation"}
        title="Variance ledger"
        lede="Five measures of one day's money. They are five different questions, not five candidates for averaging. Nothing on this page is a total of anything else. Do not force."
      />

      {lines.length === 0 ? (
        <p className="note na">Not available — no money figures were delivered for any business day yet.</p>
      ) : (
        <>
          {/* Four comparable-ish measure cards */}
          <div className="card-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {comparableIsh.map((line) => (
              <article className="panel-tinted" key={line.sourceKey}>
                <span className="stat-label">{line.measureKey}{line.sourceKey === "D3" ? " · closed" : ""}</span>
                <span style={{ ...HEADING_FONT, fontSize: 38 }}>{line.display}</span>
                <div className="hairline" />
                <dl className="kv">
                  <dt>grain</dt>
                  <dd>{grainOf(line.sourceKey)}</dd>
                  <dt>basis</dt>
                  <dd>{basisCell(line)}</dd>
                  <dt>source</dt>
                  <dd>
                    {line.sourceKey} · report {line.reportCode ?? "none"}
                  </dd>
                </dl>
                {line.note ? <p className="note" style={{ margin: 0 }}>{line.note}</p> : null}
                <ProvenanceChip provenance={line.provenance}>provenance</ProvenanceChip>
              </article>
            ))}
          </div>

          {/* D5 — set apart on its own basis (I6) */}
          {d5 ? (
            <section
              className="panel-accent"
              style={{
                marginTop: 20,
                padding: "26px 28px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 28,
              }}
            >
              <div className="stat">
                <span className="stat-label-row" style={{ justifyContent: "flex-start", gap: 12 }}>
                  <DateBasisBadge basis="booking_date" large />
                  <span className="stat-label">{d5.measureKey}</span>
                </span>
                <span style={{ ...HEADING_FONT, fontSize: 54, color: "var(--color-accent-800)", margin: "10px 0 8px" }}>
                  {d5.display}
                </span>
                <ProvenanceChip provenance={d5.provenance} accent>
                  provenance
                </ProvenanceChip>
              </div>
              <div style={{ borderLeft: "1px solid var(--color-accent-300)", paddingLeft: 28 }}>
                <p style={{ margin: "0 0 10px" }}>
                  This figure is <strong>not comparable</strong> to the other four. It counts bookings <em>created</em> on
                  this date — largely for future service dates — not services delivered.
                </p>
                <p className="note" style={{ margin: "0 0 12px" }}>
                  {bookingTotalCount !== undefined
                    ? `${bookingTotalCount} bookings · SPA ${channelCount("SPA") ?? "—"} / ONLINE ${channelCount("ONLINE") ?? "—"} / MOBILE ${channelCount("MOBILE") ?? "—"} · grain ${grainOf("D5")}`
                    : `grain ${grainOf("D5")} · channel counts not delivered`}
                </p>
                <Link className="link-action" href="/hypotheses">
                  H1 explains this gap →
                </Link>
              </div>
            </section>
          ) : null}

          {/* Pairwise deltas — display-only annotations, never a reconciliation */}
          <div className="table-wrap" style={{ marginTop: 20 }}>
            <div className="table-wrap-head">
              <h2 className="chart-title">Pairwise deltas</h2>
              <p className="note" style={{ margin: "6px 0 0" }}>
                Arithmetic difference in cents only. This table is not a reconciliation and nothing here is a total.
              </p>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>A</th>
                  <th>B</th>
                  <th className="num">Delta (A − B)</th>
                  <th>Standing explanation</th>
                </tr>
              </thead>
              <tbody>
                {DELTA_ROWS.flatMap((row) => {
                  const a = byKey.get(row.a);
                  const b = byKey.get(row.b);
                  if (!a || !b) return [];
                  // Plain integer-cents subtraction rendered as an annotation —
                  // deliberately NOT Measure arithmetic (I2); the cross-basis
                  // row exists only to close the matrix and is marked as such.
                  const delta = toDisplay(fromCents(a.valueCents - b.valueCents));
                  return [
                    <tr key={`${row.a}-${row.b}`}>
                      <td>
                        {row.a} · {a.measureKey}
                      </td>
                      <td>
                        {row.b} · {b.measureKey}
                      </td>
                      <td className={row.crossBasis ? "num cell-emph" : "num"}>{delta}</td>
                      <td className={row.crossBasis ? "cell-emph" : undefined}>{row.explanation}</td>
                    </tr>,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
