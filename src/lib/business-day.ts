import type { FactRow } from "@/lib/queries/facts";

/**
 * Derived business day — the one rule every screen shares.
 *
 * A screen's business day is the latest `business_date` its own sources
 * actually delivered, never a hardcoded date. This is the same derivation
 * Today and the variance ledger use (latest delivered total row for the
 * screen's measure), extracted here so no page grows a private variant.
 *
 * Business dates are calendar-date strings in America/Phoenix (CLAUDE.md
 * §6), so lexicographic comparison is chronological — no Date parsing and
 * no DST handling.
 *
 * Returns `null` when the given sources have delivered nothing. Callers
 * must render the explicit "Not available" / no-delivery state with the
 * reason (I5) — never fall back to a default date. The derived day carries
 * its source's date basis (I6) and the facts it selects keep their
 * provenance (I4).
 */
export function latestDeliveredDay(
  facts: readonly FactRow[],
  opts: { measureKeys?: readonly string[]; totalRowsOnly?: boolean } = {},
): string | null {
  const totalRowsOnly = opts.totalRowsOnly ?? false;
  const keys = opts.measureKeys;
  let latest: string | null = null;
  for (const f of facts) {
    if (totalRowsOnly && !f.isTotalRow) continue;
    if (keys && !keys.includes(f.measureKey)) continue;
    if (latest === null || f.businessDate > latest) latest = f.businessDate;
  }
  return latest;
}

/**
 * Shift a YYYY-MM-DD business-date string by whole calendar days. Pure
 * calendar arithmetic in UTC on the date fields only — business dates are
 * America/Phoenix calendar dates and Phoenix has no DST, so no timezone
 * math belongs here (CLAUDE.md §6).
 */
export function shiftBusinessDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
