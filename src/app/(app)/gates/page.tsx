import { getDb } from "@/lib/runtime";
import { evaluateGates } from "@/lib/gates";

export default async function GatesPage() {
  const db = await getDb();
  const gates = await evaluateGates(db);
  return (
    <>
      <h1>Sufficiency gates</h1>
      <p className="lede">
        Can we make a pricing decision yet? Today the honest answer is no. These values are computed from the database
        and will turn themselves on when the collection plan lands.
      </p>
      {gates.map((g) => (
        <article className={`card ${g.passing ? "pass" : "fail"}`} key={g.id} data-gate={g.id} data-passing={String(g.passing)}>
          <h2>
            {g.id} {g.passing ? "PASS" : "FAIL"}
          </h2>
          <p>{g.label}</p>
          <p className="meta">Threshold: {g.threshold}</p>
          <p className="meta">Current: {g.current}</p>
          <p>{g.remedy}</p>
        </article>
      ))}
    </>
  );
}
