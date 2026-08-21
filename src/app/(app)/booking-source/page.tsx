import { DateBasisBadge } from "@/components/DateBasisBadge";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";
import { latestDeliveredDay } from "@/lib/business-day";

export default async function BookingSourcePage() {
  const db = await getDb();
  const values = await activeFacts(db, { measureKey: "booking_value_by_source" });
  const counts = await activeFacts(db, { measureKey: "booking_count_by_source" });

  // I5 — the business day is the latest date D5 delivered, never hardcoded.
  // D5 is on booking_date (I6): the derived day is a day bookings were
  // created, not a day services were delivered.
  const day = latestDeliveredDay([...values, ...counts]);
  if (day === null) {
    return (
      <section
        className="panel-accent--40"
        style={{ border: "1px solid var(--color-accent-500)", padding: "36px 40px" }}
      >
        <div
          className="page-header page-header--flex"
          style={{ borderBottomColor: "var(--color-accent-300)" }}
        >
          <div>
            <div className="page-kicker" style={{ color: "var(--color-accent-800)" }}>
              D5 · report 1343
            </div>
            <h1 className="page-title">Booking sources</h1>
          </div>
          <div className="page-header-stat">
            <DateBasisBadge basis="booking_date" large />
          </div>
        </div>
        <section className="panel-dotted" style={{ background: "var(--color-bg)" }}>
          <div className="panel-dotted-title">Not available</div>
          <p className="note">
            Report 1343 (D5) has delivered no business day yet, so there is no date to show. Absent
            is not zero — no shares are drawn (I5).
          </p>
        </section>
      </section>
    );
  }

  const channels = values
    .filter((f) => f.businessDate === day && f.dimensionType === "source")
    .sort((a, b) => b.valueNumeric - a.valueNumeric);
  const totalV = values.find((f) => f.businessDate === day && f.isTotalRow);
  const totalC = counts.find((f) => f.businessDate === day && f.isTotalRow);
  const countOf = (s: string | null) =>
    counts.find(
      (f) => f.businessDate === day && f.dimensionType === "source" && f.dimensionValue === s,
    );

  return (
    <section
      className="panel-accent--40"
      style={{ border: "1px solid var(--color-accent-500)", padding: "36px 40px" }}
    >
      <div
        className="page-header page-header--flex"
        style={{ borderBottomColor: "var(--color-accent-300)" }}
      >
        <div>
          <div className="page-kicker" style={{ color: "var(--color-accent-800)" }}>
            D5 · report 1343 · booking date {day}
          </div>
          <h1 className="page-title">Booking sources</h1>
          <p className="page-lede" style={{ color: "var(--color-accent-900)" }}>
            Everything on this screen is on <strong>booking date</strong> — bookings created on{" "}
            {day}, whenever the service will be delivered. Do not read it as the day&apos;s
            delivered business. Hypothesis H1 remains open.
          </p>
        </div>
        <div className="page-header-stat">
          <DateBasisBadge basis="booking_date" large />
        </div>
      </div>

      {channels.length > 0 ? (
        <div className="card-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {channels.map((f) => {
            const c = countOf(f.dimensionValue);
            const zero = f.valueNumeric === 0 && (c?.valueNumeric ?? 0) === 0;
            const pct = totalV && totalV.valueNumeric > 0 ? (f.valueNumeric / totalV.valueNumeric) * 100 : null;
            return (
              <div
                key={f.dimensionValue}
                data-figure="true"
                data-measure-key="booking_value_by_source"
                style={
                  zero
                    ? { border: "1px dotted var(--color-neutral-400)", padding: "24px 26px" }
                    : {
                        border: "1px solid var(--color-accent-300)",
                        background: "var(--color-bg)",
                        padding: "24px 26px",
                      }
                }
              >
                <span className="stat-label-row">
                  <span className="stat-label">{f.dimensionValue}</span>
                  {zero ? <StatusBadge kind="insufficient" label="no records" /> : null}
                </span>
                <div
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 400,
                    fontSize: 44,
                    lineHeight: 1.1,
                    margin: "6px 0 2px",
                    fontVariantNumeric: "tabular-nums",
                    color: zero ? "var(--color-neutral-500)" : undefined,
                  }}
                >
                  {zero ? "0" : pct !== null ? `${pct.toFixed(2)}%` : toDisplay(fromCents(f.valueNumeric))}
                </div>
                {zero ? (
                  <p className="note" style={{ margin: "0 0 12px" }}>
                    A true zero from the report, not a missing feed. The channel exists and
                    produced nothing on this date.
                  </p>
                ) : (
                  <>
                    <span className="stat-sub">
                      {toDisplay(fromCents(f.valueNumeric))} · {c ? `${c.valueNumeric} bookings` : "count not available"}
                    </span>
                    {pct !== null ? (
                      <div className="share-bar" style={{ width: `${pct.toFixed(2)}%` }} />
                    ) : null}
                  </>
                )}
                <span className="stat-meta" style={{ marginTop: 12 }}>
                  <ProvenanceChip provenance={provenanceOf(f)} accent>
                    provenance
                  </ProvenanceChip>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <section className="panel-dotted" style={{ background: "var(--color-bg)" }}>
          <div className="panel-dotted-title">Not available</div>
          <p className="note">
            Report 1343 delivered no source rows for this date. Absent is not zero — no shares are
            drawn.
          </p>
        </section>
      )}

      <div
        style={{
          borderTop: "1px solid var(--color-accent-300)",
          marginTop: 28,
          paddingTop: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        {totalV && totalC ? (
          <div style={{ color: "var(--color-accent-900)" }}>
            Total {totalC.valueNumeric} bookings ·{" "}
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 400,
                fontSize: 22,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {toDisplay(fromCents(totalV.valueNumeric))}
            </span>{" "}
            created
          </div>
        ) : (
          <div className="na">Total not available — report 1343 delivered no total row.</div>
        )}
        <span className="stat-meta">
          <a className="link-action" href="/variance">
            Why this is set apart →
          </a>
          {totalV ? (
            <ProvenanceChip provenance={provenanceOf(totalV)} accent>
              D5 · 1343
            </ProvenanceChip>
          ) : null}
        </span>
      </div>
    </section>
  );
}
