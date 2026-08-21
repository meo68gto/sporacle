import { DateBasisBadge } from "@/components/DateBasisBadge";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";
import { latestDeliveredDay } from "@/lib/business-day";

const ORDER = ["closed", "cancelled", "booked", "waitlist"];

export default async function StatusPage() {
  const db = await getDb();
  const values = await activeFacts(db, { measureKey: "appt_value_by_status" });
  const counts = await activeFacts(db, { measureKey: "appt_count_by_status" });

  // I5 — the business day is the latest date D3 delivered, never hardcoded.
  const day = latestDeliveredDay([...values, ...counts]);
  if (day === null) {
    return (
      <>
        <PageHeader
          kicker="D3 · report 1253 · service date"
          title="Status mix"
          lede="Four statuses from one report, one grain, one basis. The cancellation figure is the one worth a conversation."
        />
        <section className="panel-dotted">
          <div className="panel-dotted-title">Not available</div>
          <p className="note">
            Report 1253 (D3) has delivered no business day yet, so there is no date to show. Absent
            is not zero — nothing is rendered as 0 (I5).
          </p>
        </section>
      </>
    );
  }

  const dayValues = values.filter((f) => f.businessDate === day && f.dimensionType === "status");
  const dayCounts = counts.filter((f) => f.businessDate === day && f.dimensionType === "status");
  const valueOf = (s: string) => dayValues.find((f) => f.dimensionValue === s);
  const countOf = (s: string) => dayCounts.find((f) => f.dimensionValue === s);

  const rows = [
    ...ORDER.filter((s) => dayValues.some((f) => f.dimensionValue === s)),
    ...dayValues
      .map((f) => f.dimensionValue ?? "")
      .filter((s) => s !== "" && !ORDER.includes(s)),
  ];

  const closed = valueOf("closed");
  const cancelled = valueOf("cancelled");
  const cancelledCount = countOf("cancelled");
  // I2: summing counts is legal here — every row shares measure_key
  // appt_count_by_status, the same grain and the same date basis (D3 / 1253).
  const totalCount = dayCounts.reduce((acc, f) => acc + f.valueNumeric, 0);
  const pct =
    closed && cancelled && closed.valueNumeric + cancelled.valueNumeric > 0
      ? (cancelled.valueNumeric / (closed.valueNumeric + cancelled.valueNumeric)) * 100
      : null;
  const firstDayValue = dayValues[0];

  return (
    <>
      <PageHeader
        kicker={`D3 · report 1253 · service date ${day}`}
        title="Status mix"
        lede="Four statuses from one report, one grain, one basis. The cancellation figure is the one worth a conversation."
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.15fr 1fr",
          gap: 28,
          alignItems: "stretch",
        }}
      >
        {closed && cancelled ? (
          <section
            className="panel-tinted"
            style={{ padding: "30px 32px", justifyContent: "center", gap: 14 }}
            data-figure="true"
            data-measure-key="appt_value_by_status"
          >
            <span className="stat-label">Cancelled value against closed value</span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                flexWrap: "wrap",
                fontFamily: "var(--font-heading)",
                fontWeight: 400,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ fontSize: 56, lineHeight: 1, color: "var(--color-accent-700)" }}>
                {toDisplay(fromCents(cancelled.valueNumeric))}
              </span>
              <span style={{ fontSize: 22, color: "var(--color-neutral-600)" }}>of</span>
              <span style={{ fontSize: 40, lineHeight: 1 }}>
                {toDisplay(fromCents(closed.valueNumeric))}
              </span>
            </div>
            {pct !== null ? (
              <div className="strip">
                <span className="strip-fill" style={{ width: `${pct.toFixed(1)}%` }} />
                <span className="strip-rest" />
              </div>
            ) : null}
            <p className="note" style={{ margin: 0 }}>
              {cancelledCount && totalCount > 0
                ? `${cancelledCount.valueNumeric} of ${totalCount} booked appointments cancelled. `
                : ""}
              {pct !== null
                ? `Cancelled value is ${pct.toFixed(1)}% of closed-plus-cancelled value on this report. `
                : ""}
              That is a fact about report 1253, not a yield recommendation.
            </p>
            <span className="stat-meta">
              <DateBasisBadge basis="service_date" />
              <ProvenanceChip provenance={provenanceOf(cancelled)}>provenance</ProvenanceChip>
            </span>
          </section>
        ) : (
          <section className="panel-dotted">
            <div className="panel-dotted-title">Not available</div>
            <p className="note">
              Report 1253 did not deliver closed and cancelled rows for this date. Absent is not
              zero — no ratio and no strip is drawn.
            </p>
          </section>
        )}

        <div className="table-wrap">
          <div className="table-wrap-head">
            <h2 className="chart-title">By status</h2>
            <p className="note" style={{ margin: "6px 0 0" }}>
              Waitlist 0 is a delivered true zero from report 1253, not a missing feed.
            </p>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th className="num">Count</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const v = valueOf(s);
                const c = countOf(s);
                const cls =
                  s === "cancelled"
                    ? "row-emph"
                    : c && c.valueNumeric === 0
                      ? "row-quiet"
                      : undefined;
                return (
                  <tr key={s} className={cls}>
                    <td>{s}</td>
                    <td className="num">
                      {c ? c.valueNumeric : <span className="na">Not available</span>}
                    </td>
                    <td className="num">
                      {v ? (
                        toDisplay(fromCents(v.valueNumeric))
                      ) : (
                        <span className="na">Not available</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="na">
                    Not available — no status rows delivered for this date.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="table-wrap-foot">
            The closed row is also the narrowest of the five money figures —{" "}
            <a href="/hypotheses">see H4</a>.{" "}
            {firstDayValue ? (
              <ProvenanceChip provenance={provenanceOf(firstDayValue)}>D3 · 1253</ProvenanceChip>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
