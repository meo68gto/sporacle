import { Spark } from "@/components/Spark";
import { getDb } from "@/lib/runtime";
import { activeFacts } from "@/lib/queries/facts";

export default async function CoveragePage() {
  const db = await getDb();
  const demand = (await activeFacts(db, { measureKey: "appt_count_by_hour" })).filter(
    (f) => f.businessDate === "2026-08-19" && f.dimensionType === "hour",
  );
  const scheduled = (await activeFacts(db, { measureKey: "sched_shift_hours" })).filter((f) => f.isTotalRow);
  const scheduledDay = scheduled[0];
  return (
    <>
      <h1>Coverage</h1>
      <p className="lede">
        Descriptive only — where D1 hourly demand and D10 scheduled hours disagree. No staffing recommendation (gated
        at P7).
      </p>
      <div className="card">
        <Spark
          dateBasis="service_date"
          measureKey="appt_count_by_hour"
          points={demand.map((d) => ({ x: d.dimensionValue ?? "", y: d.valueNumeric }))}
        />
      </div>
      <p className="notice">
        Hourly scheduled capacity is not available (D10 grain is technician × day). Scheduled hours total{" "}
        {scheduledDay ? (scheduledDay.valueNumeric / 100).toFixed(2) : "not available"} — not spread across hours (I3,
        I5). Divergence is visible as demand concentrating at 14:00 against a daily scheduled pool.
      </p>
    </>
  );
}
