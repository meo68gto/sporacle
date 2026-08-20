import { createHash } from "node:crypto";
import { z } from "zod";
import { FEED_TO_SOURCE, SOURCE_SEED } from "@/db/sources";

export const envelopeSchema = z.object({
  envelope_version: z.literal("1"),
  delivery_id: z.string().min(1),
  feed_key: z.string().min(1),
  delivered_at: z.string().min(1),
  origin: z.object({
    system: z.string(),
    report_code: z.string().nullable(),
    report_name: z.string(),
    location: z.string(),
    pulled_at: z.string(),
    business_date_from: z.string(),
    business_date_to: z.string(),
    date_basis: z.enum(["service_date", "booking_date", "transaction_date"]),
  }),
  status: z.enum(["ok", "blocked", "degraded"]),
  blocked_reason: z.string().nullable(),
  payload: z.object({
    format: z.string(),
    rows: z.array(
      z.object({
        dimension_type: z.string(),
        dimension_value: z.string().nullable(),
        measures: z.record(z.string(), z.number()),
      }),
    ),
    totals: z.record(z.string(), z.number()),
  }),
  payload_sha256: z.string().min(1),
});

export type Envelope = z.infer<typeof envelopeSchema>;

const PII_KEYS = [
  "email",
  "phone",
  "address",
  "card",
  "pan",
  "cvv",
  "guest",
  "first_name",
  "last_name",
  "dob",
  "account_number",
];

export function canonicalPayloadJson(payload: Envelope["payload"]): string {
  return JSON.stringify(payload);
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export type EnvelopeIssue =
  | { ok: true; envelope: Envelope }
  | { ok: false; reason: string; envelope?: Envelope };

export function parseEnvelope(raw: unknown): EnvelopeIssue {
  const piiHit = findPii(raw);
  if (piiHit) return { ok: false, reason: `pii_scan:${piiHit}` };
  const parsed = envelopeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `invalid_envelope: ${parsed.error.message}` };
  const envelope = parsed.data;
  const expected = sha256Hex(canonicalPayloadJson(envelope.payload));
  if (expected !== envelope.payload_sha256) {
    return { ok: false, reason: "checksum_mismatch", envelope };
  }
  if (!(envelope.feed_key in FEED_TO_SOURCE) && !EXTRA_FEED_KEYS.has(envelope.feed_key)) {
    return { ok: false, reason: `unknown_feed_key:${envelope.feed_key}`, envelope };
  }
  const pii = findPii(envelope);
  if (pii) return { ok: false, reason: `pii_scan:${pii}`, envelope };
  const tamper = rowsVsTotals(envelope);
  if (tamper) return { ok: false, reason: tamper, envelope };
  return { ok: true, envelope };
}

export const EXTRA_FEED_KEYS = new Set([
  "pms_hotel_occupancy",
  "b4t_service_price_master",
  "b4t_price_change_history",
]);

function findPii(value: unknown, path = ""): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findPii(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const key = k.toLowerCase();
      if (PII_KEYS.some((p) => key === p || key.endsWith(`_${p}`))) return `${path}.${k}`;
      const hit = findPii(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}

function rowsVsTotals(envelope: Envelope): string | null {
  if (envelope.status === "blocked") return null;
  const recomputed: Record<string, number> = {};
  for (const row of envelope.payload.rows) {
    if (row.dimension_type === "total" || row.dimension_type === "hottest") continue;
    for (const [k, v] of Object.entries(row.measures)) {
      recomputed[k] = (recomputed[k] ?? 0) + v;
    }
  }
  for (const [k, total] of Object.entries(envelope.payload.totals)) {
    const rowSum = recomputed[k];
    if (rowSum !== undefined && rowSum !== total) {
      return `tamper_rows_vs_totals:${k}:rows=${rowSum}:totals=${total}`;
    }
  }
  return null;
}

export function sourceForFeed(feedKey: string) {
  const key = FEED_TO_SOURCE[feedKey];
  return SOURCE_SEED.find((s) => s.key === key) ?? null;
}
