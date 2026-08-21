/**
 * The five status treatments (design spec §2.5), as one reusable badge.
 * Status is carried by border style + gold tint — never green/red.
 *  - unvalidated: a real claim whose basis/denominator is unverified
 *  - insufficient: n too small to chart (also `no records`, `totals only`)
 *  - blocked: upstream source failure (I8) — solid badge on dark panel
 *  - not-configured: a feed that does not exist yet
 *  - no-delivery: expected data that did not arrive (transport trouble, I5)
 * Blocked (source trouble) and no-delivery (transport trouble) must never
 * be merged.
 */
export type StatusKind = "unvalidated" | "insufficient" | "blocked" | "not-configured" | "no-delivery";

const DEFAULT_LABEL: Record<StatusKind, string> = {
  unvalidated: "unvalidated",
  insufficient: "insufficient data",
  blocked: "blocked",
  "not-configured": "not configured",
  "no-delivery": "no delivery",
};

const CLASS: Record<StatusKind, string> = {
  unvalidated: "st-unvalidated",
  insufficient: "st-insufficient",
  blocked: "st-blocked",
  "not-configured": "st-notconfigured",
  "no-delivery": "st-nodelivery",
};

export function StatusBadge(props: { kind: StatusKind; label?: string }) {
  return (
    <span className={`st ${CLASS[props.kind]}`} data-status={props.kind}>
      {props.label ?? DEFAULT_LABEL[props.kind]}
    </span>
  );
}
