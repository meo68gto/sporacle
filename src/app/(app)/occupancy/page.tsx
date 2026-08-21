import { Figure } from "@/components/Figure";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { StatGrid } from "@/components/StatGrid";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";

const DAY = "2026-08-19";

export default async function OccupancyPage() {
  const db = await getDb();
  const values = await activeFacts(db, { measureKey: "service_value_by_facility" });
  const counts = await activeFacts(db, { measureKey: "service_count_by_facility" });
  const fill = await activeFacts(db, { measureKey: "facility_fill_pct" });
  const facilities = values
    .filter((f) => f.businessDate === DAY && f.dimensionType === "facility")
    .sort((a, b) => b.valueNumeric - a.valueNumeric);
  const countOf = (s: string | null) =>
    counts.find(
      (f) => f.businessDate === DAY && f.dimensionType === "facility" && f.dimensionValue === s,
    );
  const totalV = values.find((f) => f.businessDate === DAY && f.isTotalRow);
  const totalC = counts.find((f) => f.businessDate === DAY && f.isTotalRow);
  const overallFill = fill.find((f) => f.businessDate === DAY && f.isTotalRow);
  const hottest = fill.find((f) => f.businessDate === DAY && f.dimensionType === "hottest");
  const firstFacility = facilities[0];

  return (
    <>
      <PageHeader
        kicker="D4 · report 1524 · service date"
        title="Occupancy"
        lede="Service counts and value by facility from a single report. Fill % is unvalidated — the capacity denominator is unverified (H5) — so it is never a headline here."
      />
      <div style={{ display: "grid", gap: 28 }}>
        <StatGrid columns={4} compact>
          {totalC ? (
            <Figure
              label="Services"
              value={String(totalC.valueNumeric)}
              sub="service_count_by_facility · total row"
              dateBasis="service_date"
              provText="D4 · 1524"
              provenance={provenanceOf(totalC)}
            />
          ) : (
            <div>
              <span className="stat-label">Services</span>
              <p className="na">Not available — no total row delivered.</p>
            </div>
          )}
          {totalV ? (
            <Figure
              label="Claimed service value"
              value={toDisplay(fromCents(totalV.valueNumeric))}
              sub="service_value_by_facility · total row"
              dateBasis="service_date"
              provText="D4 · 1524"
              provenance={provenanceOf(totalV)}
            />
          ) : (
            <div>
              <span className="stat-label">Claimed service value</span>
              <p className="na">Not available — no total row delivered.</p>
            </div>
          )}
          {overallFill ? (
            <Figure
              label="Facility fill"
              value={`${(overallFill.valueNumeric / 100).toFixed(2)}%`}
              sub="facility_fill_pct · overall"
              dateBasis="service_date"
              provText="D4 · 1524"
              provenance={provenanceOf(overallFill)}
              status={{
                kind: "unvalidated",
                note: "Capacity denominator unverified — see H5. Never a headline.",
              }}
            />
          ) : (
            <div>
              <span className="stat-label">Facility fill</span>
              <p className="na">Not available — no overall fill delivered.</p>
            </div>
          )}
          {hottest ? (
            <Figure
              label="Hottest facility fill"
              value={`${(hottest.valueNumeric / 100).toFixed(2)}%`}
              sub={`hottest · ${hottest.dimensionValue ?? "facility unknown"}`}
              dateBasis="service_date"
              provText="D4 · 1524"
              provenance={provenanceOf(hottest)}
              status={{
                kind: "unvalidated",
                note: "Not comparable to the overall figure without the capacity basis.",
              }}
            />
          ) : (
            <div>
              <span className="stat-label">Hottest facility fill</span>
              <p className="na">Not available — no hottest row delivered.</p>
            </div>
          )}
        </StatGrid>

        <div className="table-wrap">
          <div className="table-wrap-head">
            <h2 className="chart-title">By facility</h2>
            <p className="note" style={{ margin: "6px 0 0" }}>
              Rows are claims from report 1524 on service date — not appointment records.
            </p>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Facility</th>
                <th className="num">Services</th>
                <th className="num">Value</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => {
                const c = countOf(f.dimensionValue);
                return (
                  <tr key={f.dimensionValue}>
                    <td>{f.dimensionValue}</td>
                    <td className="num">
                      {c ? c.valueNumeric : <span className="na">Not available</span>}
                    </td>
                    <td className="num">{toDisplay(fromCents(f.valueNumeric))}</td>
                  </tr>
                );
              })}
              {facilities.length === 0 ? (
                <tr>
                  <td colSpan={3} className="na">
                    Not available — no facility rows delivered for this date.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="table-wrap-foot">
            Values are the report&apos;s claims for {DAY}.{" "}
            {firstFacility ? (
              <ProvenanceChip provenance={provenanceOf(firstFacility)}>D4 · 1524</ProvenanceChip>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
