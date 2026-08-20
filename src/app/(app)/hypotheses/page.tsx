import { getDb } from "@/lib/runtime";
import { reconciliationHypothesis } from "@/db/schema";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { addHypothesisAction, promoteAction } from "./actions";

export default async function HypothesesPage() {
  const user = await requireUser();
  const db = await getDb();
  const rows = await db.select().from(reconciliationHypothesis);
  return (
    <>
      <h1>Hypothesis board</h1>
      <p className="lede">Open explanations for the five-way money divergence. Promotion is an admin-signed definition, never automatic. H4 is arithmetically clean and still not auto-promoted.</p>
      {rows.map((h) => (
        <article className="card" key={h.id}>
          <h2>{h.id.toUpperCase()} · {h.status}</h2>
          <p>{h.description}</p>
          <p className="meta">Test: {h.testPlan}</p>
          <p className="meta">Missing: {h.missingData}</p>
          {h.status === "open" && can(user, "promote_hypothesis") ? (
            <form action={promoteAction}>
              <input type="hidden" name="id" value={h.id} />
              <button type="submit">Promote to signed definition</button>
            </form>
          ) : null}
        </article>
      ))}
      {can(user, "add_hypothesis") ? (
        <form className="card" action={addHypothesisAction}>
          <h2>Add hypothesis</h2>
          <textarea name="description" required rows={3} style={{ width: "100%" }} />
          <div style={{ height: 8 }} />
          <input name="testPlan" placeholder="What would settle it" style={{ width: "100%" }} />
          <div style={{ height: 8 }} />
          <button type="submit">Save</button>
        </form>
      ) : null}
    </>
  );
}
