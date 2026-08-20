/** Business dates are calendar dates in America/Phoenix. Phoenix has no DST. */

export const BUSINESS_TIME_ZONE = "America/Phoenix" as const;

export type BusinessDate = string & { readonly __brand: "BusinessDate" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function asBusinessDate(value: string): BusinessDate {
  if (!DATE_RE.test(value)) {
    throw new Error(`Invalid business date: ${value}`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d, 19, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(probe);
  const py = parts.find((p) => p.type === "year")?.value;
  const pm = parts.find((p) => p.type === "month")?.value;
  const pd = parts.find((p) => p.type === "day")?.value;
  if (`${py}-${pm}-${pd}` !== value) {
    throw new Error(`Business date ${value} is not a real calendar date`);
  }
  return value as BusinessDate;
}

export function phoenixOffsetHours(instant: Date): number {
  const utc = instant.toLocaleString("en-US", { timeZone: "UTC", hour12: false, hour: "2-digit" });
  const phx = instant.toLocaleString("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour12: false,
    hour: "2-digit",
  });
  const utcHour = Number(utc.split(" ")[0] ?? utc);
  const phxHour = Number(phx.split(" ")[0] ?? phx);
  let diff = utcHour - phxHour;
  if (diff < -12) diff += 24;
  if (diff > 12) diff -= 24;
  return diff;
}

export function eachDateInclusive(from: BusinessDate, to: BusinessDate): BusinessDate[] {
  const out: BusinessDate[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    out.push(asBusinessDate(iso));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
