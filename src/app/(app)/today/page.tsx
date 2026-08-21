import Link from "next/link";
import { Figure } from "@/components/Figure";
import { PageHeader } from "@/components/PageHeader";
import { ProvenanceChip } from "@/components/ProvenanceChip";
import { StatGrid } from "@/components/StatGrid";
import { DateBasisBadge } from "@/components/DateBasisBadge";
import { StatusBadge } from "@/components/StatusBadge";
import { getDb } from "@/lib/runtime";
import { activeFacts, provenanceOf, type FactRow } from "@/lib/queries/facts";
import { varianceLines } from "@/lib/reconciliation/variance";
import { ingestRun, source } from "@/db/schema";
import { fromCents, toDisplay } from "@/lib/money";
import { BUSINESS_TIME_ZONE } from "@/lib/date";
import { latestDeliveredDay } from "@/lib/business-day";
import { SOURCE_SEED } from "@/db/sources";

/**
 * Today — the daily reading (design spec §3.1). Every figure is read from
 * the fact table via the query layer, never fabricated (I3). Every number
 * carries provenance (I4). Missing tile data renders "Not available" with
 * a reason, never 0 (I5). Date basis is explicit on every tile (I6); the
 * booking-date tile is the loud one.
 */

const HEADING_FONT: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 400,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1.1,
};

function longDate(businessDate: string): string {
  const d = new Date(`${businessDate}T12:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(d);
  return `${part({ weekday: "long" })}, ${part({ day: "numeric" })} ${part({ month: "long" })} ${part({ year: "numeric" })}`;
}

function phoenixTime(at: Date): string {
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return `${t} MST`;
}

/** I5 — a tile whose data did not arrive renders the reason, never 0. */
function NotAvailableTile(props: { label: string; reason: string }) {
  return (
    <div className="stat">
      <span className="stat-label-row">
        <span className="stat-label">{props.label}</span>
        <StatusBadge kind="no-delivery" />
      </span>
      <span className="stat-value na" style={{ fontSize: 28 }}>
        Not available
      </span>
      <span className="stat-sub">{props.reason}</span>
    </div>
  );
}

export default async function TodayPage() {
  const db = await getDb();
  const all = await activeFacts(db);

  // The business day is the latest date for which D1 delivered a total row
  // (shared derivation — I5: derived from deliveries, never hardcoded).
  const day = latestDeliveredDay(all, { measureKeys: ["appt_count_by_hour"], totalRowsOnly: true });
  const onDay = day ? all.filter((f) => f.businessDate === day) : [];
  const find = (measureKey: string, extra: (f: FactRow) => boolean = () => true) =>
    onDay.find((f) => f.measureKey === measureKey && extra(f));

  // Header right block — derived from ingest runs and the source registry.
  const runs = await db
    .select({ sourceId: ingestRun.sourceId, status: ingestRun.status, deliveredAt: ingestRun.deliveredAt })
    .from(ingestRun);
  const sources = await db.select({ id: source.id }).from(source);
  // I3 — the "N of M sources delivered" headline counts only the registered
  // report sources (SOURCE_SEED). Operational feed rows (e.g. the Veluma
  // events receiver) are not report sources and must never inflate either
  // the numerator or the denominator.
  const reportSourceIds = new Set<string>(SOURCE_SEED.map((s) => s.id));
  const reportSources = sources.filter((s) => reportSourceIds.has(s.id));
  const okRuns = runs.filter((r) => r.status === "success" && reportSourceIds.has(r.sourceId));
  const lastDelivered = okRuns
    .map((r) => r.deliveredAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())
    .at(-1);
  const deliveredSources = new Set(okRuns.map((r) => r.sourceId)).size;

  // Tiles (D1, D3, D4, D5, D6) — one source per tile, no cross-source math (I2).
  const apptTotal = find("appt_count_by_hour", (f) => f.isTotalRow);
  const hourCounts = onDay.filter((f) => f.measureKey === "appt_count_by_hour" && f.dimensionType === "hour");
  const peak = hourCounts.length
    ? hourCounts.reduce((a, b) => (a.valueNumeric >= b.valueNumeric ? a : b))
    : undefined;
  const peakValue = peak
    ? find("appt_value_by_hour", (f) => f.dimensionType === "hour" && f.dimensionValue === peak.dimensionValue)
    : undefined;

  const statusCount = (s: string) => find("appt_count_by_status", (f) => f.dimensionValue === s);
  const statusValue = (s: string) => find("appt_value_by_status", (f) => f.dimensionValue === s);
  const closedC = statusCount("closed");
  const cancelledC = statusCount("cancelled");
  const bookedC = statusCount("booked");
  const waitlistC = statusCount("waitlist");
  const cancelledV = statusValue("cancelled");

  const bookingCount = (s: string) => find("booking_count_by_source", (f) => f.dimensionValue === s);
  const bookingCountTotal = find("booking_count_by_source", (f) => f.isTotalRow);
  const online = bookingCount("ONLINE");
  const spa = bookingCount("SPA");
  const pct = (part: number, whole: number) => ((part / whole) * 100).toFixed(2);

  const fillOverall = find("facility_fill_pct", (f) => f.isTotalRow);
  const fillHottest = find("facility_fill_pct", (f) => f.dimensionType === "hottest");

  const turnawayN = find("turnaway_count", (f) => f.isTotalRow);
  const turnawayV = find("turnaway_value", (f) => f.isTotalRow);
  const turnawayReason = find("turnaway_count", (f) => f.dimensionType === "reason");

  // "Five money figures, kept apart" — the variance lines, shown side by
  // side and never combined (I2). Reorder D1..D5 for the band.
  const lines = day ? varianceLines(all, day) : [];
  const ordered = ["D1", "D2", "D3", "D4", "D5"]
    .map((k) => lines.find((l) => l.sourceKey === k))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));
  const bandCaption: Record<string, string> = {
    D1: "appointment value · D1",
    D2: "POS gross · D2 · txn date",
    D3: "closed appointments · D3",
    D4: "service value · D4",
    D5: "bookings created · D5 · booking date",
  };

  return (
    <>
      <PageHeader
        kicker="Daily reading"
        title={day ? longDate(day) : "No business day delivered"}
        lede={
          <>
            One day, read from the reports as they arrived. There is no headline money figure for this day — five
            reports claim five different ones, and they are kept apart in the{" "}
            <Link href="/variance">variance ledger</Link>.
          </>
        }
        right={
          <>
            <div className="page-header-stat-label">Last ingest</div>
            <div className="page-header-stat-value">{lastDelivered ? phoenixTime(lastDelivered) : <span className="na">Not available</span>}</div>
            <div className="page-header-stat-sub">
              {reportSources.length > 0
                ? `${deliveredSources} of ${reportSources.length} sources delivered`
                : "source registry empty"}
            </div>
          </>
        }
      />

      <StatGrid columns={3}>
        {/* Appointments — D1 */}
        <div>
          {apptTotal ? (
            <Figure
              label="Appointments"
              value={String(apptTotal.valueNumeric)}
              sub="appt_count_by_hour · total row"
              dateBasis="service_date"
              provenance={provenanceOf(apptTotal)}
              provText={`D1 · ${apptTotal.reportCode ?? "no report"}`}
            />
          ) : (
            <NotAvailableTile label="Appointments" reason={`No D1 delivery for ${day ?? "any business day"}.`} />
          )}
        </div>

        {/* Peak hour — D1, hour dimension */}
        <div>
          {peak ? (
            <Figure
              label="Peak hour"
              value={`${(peak.dimensionValue ?? "").padStart(2, "0")}:00`}
              sub={
                peakValue
                  ? `${peak.valueNumeric} appointments · ${toDisplay(fromCents(peakValue.valueNumeric))} claimed`
                  : `${peak.valueNumeric} appointments`
              }
              dateBasis="service_date"
              provenance={provenanceOf(peak)}
              provText={`D1 · ${peak.reportCode ?? "no report"}`}
            />
          ) : (
            <NotAvailableTile label="Peak hour" reason={`No D1 hour detail for ${day ?? "any business day"}.`} />
          )}
        </div>

        {/* Status mix — D3 */}
        <div>
          {closedC && cancelledC && bookedC ? (
            <div className="stat">
              <span className="stat-label-row">
                <span className="stat-label">Status mix</span>
              </span>
              <span style={{ ...HEADING_FONT, fontSize: 34, margin: "6px 0 2px", display: "block" }}>
                {closedC.valueNumeric} closed{" "}
                <span style={{ color: "var(--color-accent-700)" }}>/ {cancelledC.valueNumeric} cancelled</span>{" "}
                / {bookedC.valueNumeric} booked
              </span>
              <span className="stat-sub">
                waitlist {waitlistC ? waitlistC.valueNumeric : "not delivered"}
                {cancelledV ? ` · cancellation value ${toDisplay(fromCents(cancelledV.valueNumeric))}` : null}
              </span>
              <span className="stat-meta">
                <DateBasisBadge basis="service_date" />
                <ProvenanceChip provenance={provenanceOf(closedC)}>{`D3 · ${closedC.reportCode ?? "no report"}`}</ProvenanceChip>
              </span>
            </div>
          ) : (
            <NotAvailableTile label="Status mix" reason={`No D3 delivery for ${day ?? "any business day"}.`} />
          )}
        </div>

        {/* Booking mix — D5, booking date: the loud tile (I6) */}
        <div className="cell--booking">
          {bookingCountTotal && bookingCountTotal.valueNumeric === 0 ? (
            /* I5: a delivered zero is a true zero from the report, never an absence state. */
            <div className="stat">
              <span className="stat-label-row">
                <span className="stat-label">Booking mix</span>
                <StatusBadge kind="insufficient" label="no records" />
              </span>
              <span style={{ ...HEADING_FONT, fontSize: 34, margin: "6px 0 2px", display: "block", color: "var(--color-neutral-500)" }}>
                0
              </span>
              <span className="stat-sub">
                A true zero from report {bookingCountTotal.reportCode ?? "1343"} — the report delivered, and no bookings
                were created on this date.
              </span>
              <span className="stat-meta">
                <DateBasisBadge basis="booking_date" />
                <ProvenanceChip provenance={provenanceOf(bookingCountTotal)} accent>
                  {`D5 · ${bookingCountTotal.reportCode ?? "no report"}`}
                </ProvenanceChip>
              </span>
            </div>
          ) : online && spa && bookingCountTotal ? (
            <div className="stat">
              <span className="stat-label-row">
                <span className="stat-label">Booking mix</span>
                <DateBasisBadge basis="booking_date" />
              </span>
              <span style={{ ...HEADING_FONT, fontSize: 34, margin: "6px 0 2px", display: "block", color: "var(--color-accent-800)" }}>
                {pct(online.valueNumeric, bookingCountTotal.valueNumeric)}% online ·{" "}
                {pct(spa.valueNumeric, bookingCountTotal.valueNumeric)}% spa
              </span>
              <span className="stat-sub">
                <em>Bookings created on this date — not services delivered.</em>
              </span>
              <span className="stat-meta">
                <ProvenanceChip provenance={provenanceOf(bookingCountTotal)} accent>
                  {`D5 · ${bookingCountTotal.reportCode ?? "no report"}`}
                </ProvenanceChip>
              </span>
            </div>
          ) : (
            <NotAvailableTile
              label="Booking mix"
              reason={
                bookingCountTotal
                  ? `D5 delivered a total but not a complete channel breakdown for ${day ?? "this day"}.`
                  : `No D5 delivery for ${day ?? "any business day"}.`
              }
            />
          )}
        </div>

        {/* Facility fill — D4, unvalidated (glossary: never a headline) */}
        <div>
          {fillOverall ? (
            <>
              <Figure
                label="Facility fill"
                value={`${(fillOverall.valueNumeric / 100).toFixed(2)}%`}
                sub={
                  fillHottest
                    ? `Denominator unverified — hottest room reads ${(fillHottest.valueNumeric / 100).toFixed(2)}% on the same run.`
                    : "Denominator unverified."
                }
                dateBasis="service_date"
                provenance={provenanceOf(fillOverall)}
                provText={`D4 · ${fillOverall.reportCode ?? "no report"}`}
                status={{ kind: "unvalidated" }}
              />
              <p className="note" style={{ margin: "8px 0 0" }}>
                <Link href="/hypotheses">H5 tracks the capacity basis →</Link>
              </p>
            </>
          ) : (
            <NotAvailableTile label="Facility fill" reason={`No D4 delivery for ${day ?? "any business day"}.`} />
          )}
        </div>

        {/* Turnaway — D6, insufficient data (n too small to chart) */}
        <div>
          {turnawayN && turnawayV ? (
            <Figure
              label="Turnaway"
              value={`n = ${turnawayN.valueNumeric}`}
              sub={`${toDisplay(fromCents(turnawayV.valueNumeric))}${
                turnawayReason?.dimensionValue ? `, reason "${turnawayReason.dimensionValue}"` : ""
              }. One record is not a pattern, so no share and no chart is drawn.`}
              dateBasis="service_date"
              provenance={provenanceOf(turnawayN)}
              provText="D6 · turnaway"
              status={{ kind: "insufficient" }}
            />
          ) : (
            <NotAvailableTile label="Turnaway" reason={`No D6 delivery for ${day ?? "any business day"}.`} />
          )}
        </div>
      </StatGrid>

      {/* Five money figures, kept apart — never summed, never averaged (I2). */}
      <section
        style={{
          border: "1px solid var(--color-divider)",
          background: "var(--color-neutral-100)",
          marginTop: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 16,
            padding: "18px 24px 14px",
          }}
        >
          <h2 className="chart-title">Five money figures, kept apart</h2>
          <Link className="link-action" href="/variance">
            Open the ledger →
          </Link>
        </div>
        {ordered.length > 0 ? (
          <StatGrid columns={ordered.length} compact>
            {ordered.map((line) => (
              <div key={line.sourceKey} className={line.dateBasis === "booking_date" ? "cell--booking" : undefined}>
                <div className="stat">
                  <span
                    style={{
                      ...HEADING_FONT,
                      fontSize: 26,
                      color: line.dateBasis === "booking_date" ? "var(--color-accent-800)" : undefined,
                    }}
                  >
                    {line.display}
                  </span>
                  <span className="stat-sub" style={{ fontSize: 11, marginBottom: 8 }}>
                    {bandCaption[line.sourceKey] ?? `${line.measureKey} · ${line.sourceKey}`}
                  </span>
                  <span className="stat-meta">
                    <ProvenanceChip provenance={line.provenance} accent={line.dateBasis === "booking_date"}>
                      provenance
                    </ProvenanceChip>
                  </span>
                </div>
              </div>
            ))}
          </StatGrid>
        ) : (
          <p className="note na" style={{ padding: "0 24px 18px" }}>
            Not available — no money figures were delivered for this day.
          </p>
        )}
      </section>

      <p className="closing-line" style={{ marginTop: 24 }}>
        The oracle answers only what the reports asked. Five reports, five answers, one day — and no arithmetic between
        them.
      </p>
    </>
  );
}
