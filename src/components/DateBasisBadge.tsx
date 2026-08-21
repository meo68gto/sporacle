import type { DateBasis } from "@/lib/measures/registry";

/**
 * Date-basis badge (design spec §2.4, invariant I6). Three bases exist and
 * are never conflated: service_date (quiet), booking_date (loud — the
 * dangerous one), transaction_date (quiet box; dashed underline inline).
 */
export function DateBasisBadge(props: { basis: DateBasis; large?: boolean; inline?: boolean }) {
  const label = props.basis.replace(/_/g, " ");
  const variant =
    props.basis === "booking_date" ? "basis--booking" : props.basis === "transaction_date" ? "basis--transaction" : "basis--service";
  const cls = props.inline
    ? "basis basis-inline"
    : `basis ${variant}${props.large ? " basis--large" : ""}`;
  return (
    <span className={cls} data-date-basis={props.basis}>
      {label}
    </span>
  );
}
