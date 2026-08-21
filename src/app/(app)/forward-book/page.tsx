import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { source } from "@/db/schema";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import { getDb } from "@/lib/runtime";
import { unblockAction } from "../feeds/actions";

/**
 * Forward book — D7 · report 1656. The single most valuable report for
 * yield work and the broken one. The blocked state is first-class (I8):
 * the design's inverted dark panel (§2.5.3) with reason, first-seen date
 * and owner — never an empty page. Unblocking is admin-only and audited.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(iso: string): string {
  const parts = iso.split("-");
  const m = MONTHS[Number(parts[1] ?? "0") - 1] ?? "";
  return `${Number(parts[2] ?? "0")} ${m}`.trim();
}

function outageDay(since: string | null): number | null {
  if (!since) return null;
  const ms = Date.now() - Date.parse(`${since}T00:00:00Z`);
  return ms >= 0 ? Math.floor(ms / 86400000) + 1 : 1;
}

const asideLabel: React.CSSProperties = { marginBottom: 4 };
const asideValue: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
  fontSize: 22,
  fontVariantNumeric: "tabular-nums",
  margin: "0 0 16px",
};

export default async function ForwardBookPage() {
  const user = await requireUser();
  const db = await getDb();
  const d7 = (await db.select().from(source).where(eq(source.key, "D7")))[0];

  return (
    <>
      <PageHeader
        kicker={
          d7 ? `${d7.key} · report ${d7.reportCode ?? "TBC"} · ${d7.dateBasis.replace(/_/g, " ")}` : "D7 · report 1656"
        }
        title="Forward book"
        lede="On-the-books pace for future dates. Without it the pricing gates cannot close and H1 cannot be tested. When Book4Time fixes it upstream, ingest lights this page — no new UI work."
      />
      <div style={{ display: "grid", gap: 28 }}>
        {!d7 ? (
          <section className="panel-dotted">
            <div className="panel-dotted-title">Source not registered</div>
            <p className="note" style={{ margin: "8px 0 0" }}>
              D7 is missing from the source registry. Not available — absent is not zero (I5).
            </p>
          </section>
        ) : d7.status === "blocked" ? (
          <>
            <section
              className="panel-dark"
              style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 36 }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <StatusBadge kind="blocked" />
                  {outageDay(d7.blockedSince) !== null ? (
                    <span className="outage-note">day {outageDay(d7.blockedSince)} of outage</span>
                  ) : null}
                </div>
                <h2 className="panel-dark-title" style={{ margin: "0 0 12px" }}>
                  {d7.key} · report {d7.reportCode ?? "TBC"} · {d7.label}
                </h2>
                <p className="panel-dark-soft" style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6 }}>
                  The report fails upstream, verbatim, with the error below. This is the
                  highest-value report in the set and the only one that is broken. The state is
                  shown as itself — nothing is fabricated in its place.
                </p>
                {d7.blockedReason ? <span className="error-slug">{d7.blockedReason}</span> : null}
              </div>
              <div className="panel-dark-aside">
                <div className="outage-note" style={asideLabel}>
                  Blocked since
                </div>
                <div style={asideValue}>{d7.blockedSince ? dayLabel(d7.blockedSince) : "unknown"}</div>
                <div className="outage-note" style={asideLabel}>
                  Owner to chase
                </div>
                <p className="panel-dark-soft" style={{ margin: "0 0 16px", fontSize: 13 }}>
                  Book4Time support · ticket not yet raised
                </p>
                <div className="outage-note" style={asideLabel}>
                  Blocks
                </div>
                <p className="panel-dark-soft" style={{ margin: "0 0 20px", fontSize: 13 }}>
                  G7 · forward book · H1 confirmation
                </p>
                <a className="link-action" href="/health" style={{ color: "var(--color-accent-300)" }}>
                  See data health →
                </a>
              </div>
            </section>

            {can(user, "unblock_source") ? (
              <section className="panel">
                <div className="chart-head">
                  <h2 className="chart-title">Unblock this source</h2>
                  <span className="note">Admin-only · written to the audit log.</span>
                </div>
                <p className="note" style={{ margin: "0 0 16px" }}>
                  Unblock only once Book4Time confirms the fix upstream — unblocking does not
                  fabricate a delivery, it only lets the next one through.
                </p>
                <form
                  action={unblockAction}
                  style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
                >
                  <input type="hidden" name="key" value="D7" />
                  <input
                    name="reason"
                    placeholder="Why this is safe to unblock"
                    required
                    style={{ flex: "1 1 280px" }}
                  />
                  <button type="submit">Unblock</button>
                </form>
              </section>
            ) : (
              <section className="panel">
                <span className="btn-locked">Unblock · admin only</span>
                <p className="note" style={{ margin: "10px 0 0" }}>
                  Unblocking is admin-only and audited. You are signed in as {user.role}.
                </p>
              </section>
            )}
          </>
        ) : (
          <section className="panel-dotted">
            <div className="panel-dotted-title">No facts delivered yet</div>
            <p className="note" style={{ margin: "8px 0 0" }}>
              Source is {d7.status}. Forward-book facts will appear here when deliveries are
              active. Nothing is rendered as 0 in the meantime — absent is not zero (I5).
            </p>
          </section>
        )}
      </div>
    </>
  );
}
