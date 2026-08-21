import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { ingestRun } from "@/db/schema";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { ingestFileAction } from "./actions";

/**
 * File-drop ingest (admin). Not one of the ten designed screens — styled
 * with the same idioms. Day-one transport is file-drop of the same envelope
 * Veluma will deliver live; cutover is configuration, not code (CLAUDE.md §1).
 */

const heading: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
};

function utc(d: Date | null): string {
  return d ? d.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";
}

export default async function IngestPage() {
  const user = await requireUser();
  if (!can(user, "ingest")) {
    return (
      <>
        <PageHeader kicker="Admin · file-drop transport" title="File-drop ingest" lede="Admin only." />
        <section className="panel">
          <p className="note" style={{ margin: 0 }}>
            Ingest is admin-only. You are signed in as {user.role}.
          </p>
        </section>
      </>
    );
  }

  const db = await getDb();
  const runs = await db.select().from(ingestRun).orderBy(desc(ingestRun.createdAt)).limit(12);

  return (
    <>
      <PageHeader
        kicker="Admin · file-drop transport"
        title="File-drop ingest"
        lede="Day-one mode is file-drop of the same envelope Book4Time automation will send through Veluma. Live pull is configuration, not code. Paste a Veluma envelope JSON below — it is verified and recorded exactly like a live delivery."
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginBottom: 28 }}>
        <form className="panel" action={ingestFileAction}>
          <h2 style={{ ...heading, fontSize: 22, margin: "0 0 12px" }}>Paste an envelope</h2>
          <textarea
            name="envelope"
            rows={14}
            required
            aria-label="Veluma envelope JSON"
            style={{
              width: "100%",
              border: "1px solid var(--color-neutral-300)",
              borderRadius: 0,
              background: "var(--color-bg)",
              color: "var(--color-text)",
              padding: "12px 14px",
              fontSize: 12.5,
              lineHeight: 1.5,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          <div style={{ marginTop: 14 }}>
            <button type="submit">Ingest envelope</button>
          </div>
        </form>

        <aside className="panel-tinted">
          <h2 style={{ ...heading, fontSize: 20, margin: "0 0 10px" }}>What the pipeline enforces</h2>
          <p className="note">
            Every delivery&rsquo;s checksum is validated, and an envelope whose totals disagree with
            its rows is quarantined as tampered — the middleware passes through, it never reconciles
            (I12).
          </p>
          <p className="note">
            Any envelope carrying an email-like field is quarantined — no guest PII enters the schema,
            the fixtures, or the logs (I1).
          </p>
          <p className="note" style={{ marginBottom: 0 }}>
            Redelivery of the same delivery_id is a no-op. Corrections supersede the earlier run and
            retire its facts — nothing is silently overwritten.
          </p>
        </aside>
      </div>

      <div className="table-wrap">
        <div className="table-wrap-head">
          <h2 style={{ ...heading, fontSize: 22, margin: 0 }}>Recent ingest runs</h2>
          <p className="note" style={{ margin: "4px 0 0" }}>
            Delivery metadata only — the claims themselves live in the fact table, attributed to their
            report (I3).
          </p>
        </div>
        {runs.length === 0 ? (
          <p className="na" style={{ padding: "18px 24px", margin: 0 }}>
            No ingest runs recorded yet.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Delivered (UTC)</th>
                <th>Transport</th>
                <th>Feed key</th>
                <th>Business dates</th>
                <th className="num">Rows</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className={r.status === "success" ? undefined : "row-emph"}>
                  <td>{utc(r.deliveredAt ?? r.createdAt)}</td>
                  <td>{r.transport}</td>
                  <td>{r.feedKey ?? "—"}</td>
                  <td>
                    {r.businessDateFrom ?? "—"}
                    {r.businessDateTo && r.businessDateTo !== r.businessDateFrom ? ` → ${r.businessDateTo}` : ""}
                  </td>
                  <td className="num">{r.rowCount}</td>
                  <td>
                    {r.status}
                    {r.error ? ` · ${r.error}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
