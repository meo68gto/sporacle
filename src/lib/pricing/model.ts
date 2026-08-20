/**
 * Demand / elasticity helpers. Pure functions. Synthetic fixtures must never
 * reach the database — tests assert that.
 */
export type Observation = { priceCents: number; quantity: number };

export function logLogElasticity(obs: readonly Observation[]): number | null {
  if (obs.length < 8) return null;
  const prices = new Set(obs.map((o) => o.priceCents));
  if (prices.size < 3) return null;
  const xs = obs.map((o) => Math.log(o.priceCents));
  const ys = obs.map((o) => Math.log(Math.max(o.quantity, 1)));
  const n = xs.length;
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i];
    const y = ys[i];
    if (x === undefined || y === undefined) continue;
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

export function recommendedPriceCents(currentCents: number, elasticity: number, targetLift = 0): number {
  if (elasticity >= 0) return currentCents;
  const factor = 1 + targetLift;
  return Math.round(currentCents * factor);
}

export const SYNTHETIC_ELASTICITY_FIXTURE: Observation[] = [
  { priceCents: 15000, quantity: 40 },
  { priceCents: 16000, quantity: 36 },
  { priceCents: 17000, quantity: 33 },
  { priceCents: 18000, quantity: 30 },
  { priceCents: 19000, quantity: 28 },
  { priceCents: 20000, quantity: 25 },
  { priceCents: 21000, quantity: 23 },
  { priceCents: 22000, quantity: 21 },
];
