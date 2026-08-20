import { Figure } from "@/components/Figure";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf, type FactRow } from "@/lib/queries/facts";

function hours(n: number): string {
  return (n / 100).toFixed(2);
}

export default async function LaborPage() {
  const db = await getDb();
  const keys = [
    "labor_client_count",
    "labor_service_hours",
    "labor_booked_hours",
    "labor_scheduled_hours",
    "labor_utilization_pct_reported",
  ] as const;
  const rows: FactRow[] = [];
  for (const k of keys) rows.push(...(await activeFacts(db, { measureKey: k })));
  const tot = (k: string) => rows.find((r) => r.measureKey === k && r.isTotalRow);
  const service = tot("labor_service_hours");
  const booked = tot("labor_booked_hours");
  const scheduled = tot("labor_scheduled_hours");
  const clients = tot("labor_client_count");
  const util = tot("labor_utilization_pct_reported");
  return (
    <>
      <h1>Labor</h1>
      <p className="lede">
        Three hour components, separately. The source 57% is shown with formula unknown. No competing utilization is
        computed. See H6.
      </p>
      <div className="grid">
        {clients ? (
          <div className="card">
            <Figure label="labor_client_count" value={String(clients.valueNumeric)} provenance={provenanceOf(clients)} />
          </div>
        ) : null}
        {service ? (
          <div className="card">
            <Figure label="labor_service_hours" value={hours(service.valueNumeric)} provenance={provenanceOf(service)} />
          </div>
        ) : null}
        {booked ? (
          <div className="card">
            <Figure label="labor_booked_hours" value={hours(booked.valueNumeric)} provenance={provenanceOf(booked)} />
          </div>
        ) : null}
        {scheduled ? (
          <div className="card">
            <Figure
              label="labor_scheduled_hours"
              value={hours(scheduled.valueNumeric)}
              provenance={provenanceOf(scheduled)}
            />
          </div>
        ) : null}
        {util ? (
          <div className="card">
            <Figure
              label="labor_utilization_pct_reported"
              value={`${(util.valueNumeric / 100).toFixed(0)}%`}
              provenance={provenanceOf(util)}
              unvalidated="formula unknown — not recomputed from the three hour components (H6)"
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
