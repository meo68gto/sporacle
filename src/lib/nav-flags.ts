import "server-only";
import type { Db } from "@/db/client";
import { reconciliationHypothesis, source } from "@/db/schema";
import { evaluateGates, allGatesPass } from "@/lib/gates";
import { MONEY_TOTALS_FOR_VARIANCE } from "@/lib/queries/facts";

/**
 * Derived sidebar flags (design spec §2.1). The flags shown in the nav
 * ("6 open", "1 blocked", "0/7", "locked", "5") must be computed from the
 * same tables the screens read — hardcoding them would violate the spirit
 * of I5. Absent data yields null, and the nav renders no flag (I5: absent
 * is not zero).
 */
export type NavFlags = {
  openHypotheses: number;
  blockedSources: number;
  gatesOpen: number;
  gatesTotal: number;
  varianceMeasures: number;
  pricingLocked: boolean;
};

export async function navFlags(db: Db): Promise<NavFlags> {
  const [hyps, sources, gates] = await Promise.all([
    db.select({ status: reconciliationHypothesis.status }).from(reconciliationHypothesis),
    db.select({ status: source.status }).from(source),
    evaluateGates(db),
  ]);
  return {
    openHypotheses: hyps.filter((h) => h.status === "open").length,
    blockedSources: sources.filter((s) => s.status === "blocked").length,
    gatesOpen: gates.filter((g) => g.passing).length,
    gatesTotal: gates.length,
    varianceMeasures: MONEY_TOTALS_FOR_VARIANCE.length,
    pricingLocked: !allGatesPass(gates),
  };
}
