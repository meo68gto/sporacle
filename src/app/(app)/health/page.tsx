import { desc } from "drizzle-orm";
import { DateBasisBadge } from "@/components/DateBasisBadge";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { feedAdapter, ingestRun, quarantine, source } from "@/db/schema";
import { requireUser } from "@/lib/auth/request";
import { can } from "@/lib/auth/roles";
import type { DateBasis } from "@/lib/measures/registry";
import { getDb } from "@/lib/runtime";

/**
 * Data health — merged screen (design spec §3.8): blocked-source hero (I8),
 * per-source status table, not-configured feed cards and the Veluma
 * transport strip. /feeds redirects here; /forward-book keeps its own
 * blocked view. Blocked (source trouble) and no-delivery (transport
 * trouble) are distinct states and are never merged (§2.5).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stamp(d: Date | null | undefined): string | null {
  if (!d) return null;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${hh}:${mm} UTC`;
}

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

const NOT_CONFIGURED_COPY: Record<string, string> = {
  pms_hotel_occupancy:
    "Fairmont PMS occupancy and group blocks. Resort spa demand is largely hotel-driven — without this covariate a model would attribute hotel swings to price. Unlocks G6.",
  b4t_service_price_master:
    "The service and price master. Whether a service is mispriced is currently unanswerable, not merely hard. Unlocks G4; with history, G3.",
  b4t_price_change_history:
    "Versioned price change history. Without at least three distinct prices per service, elasticity is unidentifiable at any sample size. Unlocks G3.",
};

export default async function HealthPage() {
  const user = await requireUser();
  const db = await getDb();
  const sources = (await db.select().from(source)).sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true }),
  );
  const runs = await db.select().from(ingestRun).orderBy(desc(ingestRun.createdAt));
  const qs = await db.select().from(quarantine);
  const adapters = await db.select().from(feedAdapter);

  const delivered = sources.filter((s) => runs.some((r) => r.sourceId === s.id && r.status === "success")).length;
  const blockedSources = sources.filter((s) => s.status === "blocked");
  const notConfigured = adapters.filter((a) => a.status === "not_configured");
  const latestRun = runs[0];

  return (
    <>
      <PageHeader
        kicker={`${sources.length} Book4Time feeds · Veluma transport`}
        title="Data health"
        lede="A blocked delivery is source trouble. No delivery at all is transport trouble. The distinction decides who you chase."
        right={
          <>
            <div className="page-header-stat-value page-header-stat-value--lg">
              {delivered} / {sources.length}
            </div>
            <div className="page-header-stat-label">sources delivered</div>
          </>
        }
      />
      <div style={{ display: "grid", gap: 28 }}>
        {blockedSources.map((s) => {
          const day = outageDay(s.blockedSince);
          return (
            <section
              key={s.id}
              id="blocked"
              className="panel-dark"
              style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 36 }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <StatusBadge kind="blocked" />
                  {day !== null ? <span className="outage-note">day {day} of outage</span> : null}
                </div>
                <h2 className="panel-dark-title" style={{ margin: "0 0 12px" }}>
                  {s.key} · report {s.reportCode ?? "TBC"} · {s.label}
                </h2>
                <p className="panel-dark-soft" style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.6 }}>
                  {s.key === "D7"
                    ? "On-the-books pace for future dates — the highest-value report in the set and the only one that is broken. Without it the pricing gates cannot close and H1 cannot be tested."
                    : "This source is blocked at origin. Nothing is fabricated in its place — the state is shown, not smoothed over."}
                </p>
                {s.blockedReason ? <span className="error-slug">{s.blockedReason}</span> : null}
              </div>
              <div className="panel-dark-aside">
                <div className="outage-note" style={asideLabel}>
                  Blocked since
                </div>
                <div style={asideValue}>{s.blockedSince ? dayLabel(s.blockedSince) : "unknown"}</div>
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
                {can(user, "unblock_source") ? (
                  <a className="link-action" href="/forward-book" style={{ color: "var(--color-accent-300)" }}>
                    Open forward book to unblock →
                  </a>
                ) : (
                  <>
                    <span className="btn-locked btn-locked--dark">Unblock · admin only</span>
                    <p className="panel-dark-muted" style={{ margin: "10px 0 0", fontSize: 11.5 }}>
                      Unblocking is admin-only and audited. You are signed in as {user.role}.
                    </p>
                  </>
                )}
              </div>
            </section>
          );
        })}

        <section className="table-wrap" id="sources">
          <div className="table-wrap-head">
            <h2 className="chart-title" style={{ margin: 0 }}>
              Book4Time sources
            </h2>
            <p className="note" style={{ margin: "6px 0 0" }}>
              Statuses are read from the source registry and the ingest log — nothing here is
              inferred from absence except the no-delivery flag itself.
            </p>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Basis</th>
                <th>Status</th>
                <th>Last delivery</th>
                <th className="num">Quarantine</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => {
                const last = runs.find((r) => r.sourceId === s.id);
                const qCount = qs.filter(
                  (q) => q.ingestRunId && runs.some((r) => r.id === q.ingestRunId && r.sourceId === s.id),
                ).length;
                const statusCell =
                  s.status === "blocked" ? (
                    <span className="status-blocked">blocked{s.blockedReason ? ` · ${s.blockedReason}` : ""}</span>
                  ) : !last ? (
                    <span className="status-nodelivery">no delivery · transport</span>
                  ) : (
                    <span>active{s.notes ? ` · ${s.notes}` : ""}</span>
                  );
                const lastCell =
                  s.status === "blocked" ? (
                    <span className="status-nodelivery">
                      no delivery{s.blockedSince ? ` since ${dayLabel(s.blockedSince)}` : ""}
                    </span>
                  ) : last ? (
                    <span>{stamp(last.deliveredAt ?? last.createdAt)}</span>
                  ) : (
                    <span className="status-nodelivery">none recorded</span>
                  );
                return (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.key}</strong> · {s.reportCode ?? "report TBC"} · {s.label}
                    </td>
                    <td>
                      <DateBasisBadge basis={s.dateBasis as DateBasis} />
                    </td>
                    <td>{statusCell}</td>
                    <td>{lastCell}</td>
                    <td className={`num${qCount === 0 ? " cell-quiet" : ""}`}>{qCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="table-wrap-foot">
            Blocked (gold) is chased with Book4Time. No delivery (grey) is chased with Veluma
            transport. The two are never merged.
          </div>
        </section>

        {notConfigured.length > 0 ? (
          <div className="card-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {notConfigured.map((a) => (
              <section className="panel-dotted" key={a.feedKey}>
                <div style={{ marginBottom: 10 }}>
                  <StatusBadge kind="not-configured" />
                </div>
                <div className="panel-dotted-title" style={{ marginBottom: 8 }}>
                  {a.feedKey}
                </div>
                <p className="note" style={{ margin: 0 }}>
                  {NOT_CONFIGURED_COPY[a.feedKey] ?? a.notes ?? "Feed not configured yet."}
                </p>
              </section>
            ))}
          </div>
        ) : null}

        <section
          className="panel"
          id="veluma"
          style={{ display: "flex", justifyContent: "space-between", gap: 32, alignItems: "flex-start" }}
        >
          <div style={{ maxWidth: "62ch" }}>
            <h3 className="chart-title" style={{ margin: "0 0 8px" }}>
              Veluma transport
            </h3>
            <p className="note" style={{ margin: 0 }}>
              Day-one mode is file-drop of the same envelope Book4Time will automate. Live pull is
              configuration, not code. Veluma passes payloads through verbatim — every delivery
              checksum is validated at ingest, and totals that disagree with their rows are
              quarantined, never fixed in transit (I12).
            </p>
            {latestRun ? (
              <dl className="kv" style={{ marginTop: 14 }}>
                <dt>last delivery</dt>
                <dd>
                  {latestRun.deliveryId ?? "no delivery_id"} · {stamp(latestRun.deliveredAt ?? latestRun.createdAt)}
                </dd>
                <dt>payload sha256</dt>
                <dd style={{ overflowWrap: "anywhere" }}>
                  {latestRun.payloadSha256 ? `${latestRun.payloadSha256.slice(0, 16)}…` : "not recorded"}
                </dd>
                <dt>transport</dt>
                <dd>{latestRun.transport}</dd>
              </dl>
            ) : (
              <p className="na" style={{ marginTop: 14 }}>
                No deliveries recorded yet. Absent is not zero.
              </p>
            )}
          </div>
          <div style={{ textAlign: "right", flex: "none" }}>
            <div className="page-kicker">Mode</div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 24, marginTop: 6 }}>
              {latestRun ? latestRun.transport.replace(/_/g, "-") : "file-drop"}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
