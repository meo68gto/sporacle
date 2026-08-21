import { Figure } from "@/components/Figure";
import { PageHeader } from "@/components/PageHeader";
import { StatGrid } from "@/components/StatGrid";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf } from "@/lib/queries/facts";
import { fromCents, toDisplay } from "@/lib/money";

const DAY = "2026-08-19";

export default async function TurnawayPage() {
  const db = await getDb();
  const counts = await activeFacts(db, { measureKey: "turnaway_count" });
  const values = await activeFacts(db, { measureKey: "turnaway_value" });
  const n = counts.find((f) => f.businessDate === DAY && f.isTotalRow);
  const v = values.find((f) => f.businessDate === DAY && f.isTotalRow);
  const reasonRow = counts.find(
    (f) => f.businessDate === DAY && f.dimensionType === "reason",
  );

  return (
    <>
      <PageHeader
        kicker="D6 · turnaway log · service date"
        title="Turnaway"
        lede="Demand that arrived and was not served. A single record exists — enough to display, not enough to characterize."
      />
      {n && v ? (
        <div style={{ display: "grid", gap: 28 }}>
          <StatGrid columns={2} compact>
            <Figure
              label="Turnaway records"
              value={String(n.valueNumeric)}
              sub="turnaway_count · total row"
              dateBasis="service_date"
              provText="D6"
              provenance={provenanceOf(n)}
              status={{
                kind: "insufficient",
                note: "One record is not a pattern, so no share and no chart is drawn.",
              }}
            />
            <Figure
              label="Turnaway value"
              value={toDisplay(fromCents(v.valueNumeric))}
              sub={
                reasonRow
                  ? `turnaway_value · reason "${reasonRow.dimensionValue ?? "unknown"}"`
                  : "turnaway_value · total row"
              }
              dateBasis="service_date"
              provText="D6"
              provenance={provenanceOf(v)}
              status={{ kind: "insufficient" }}
            />
          </StatGrid>
          <section className="panel-tinted" style={{ padding: "22px 24px" }}>
            <p className="note" style={{ margin: 0 }}>
              {reasonRow
                ? `The lone record's reason is "${reasonRow.dimensionValue ?? "unknown"}". `
                : ""}
              At n = 1 a 100% reason share is an artifact of a single record — no percentage
              visualization is drawn, and nothing on this screen is a signal yet.
            </p>
          </section>
        </div>
      ) : (
        <section className="panel-dotted">
          <div className="panel-dotted-title">Not available</div>
          <p className="note">
            No turnaway delivery covers this date. Absent is not zero — nothing is rendered as 0.
          </p>
        </section>
      )}
    </>
  );
}
