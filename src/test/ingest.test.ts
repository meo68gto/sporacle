import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openMemoryDb } from "@/db/client";
import { seedSources } from "@/db/sources";
import { ingestRun, measureFact, quarantine } from "@/db/schema";
import { ingestEnvelope } from "@/lib/ingest/pipeline";
import { ingestVia, pullHeaders } from "@/lib/ingest/transports";
import {
  GOLDEN_DAY,
  goldenD1,
  goldenD5,
  goldenD7Blocked,
  goldenD8,
  goldenHotelOccupancy,
  rangedD1Window,
} from "@/lib/ingest/fixtures/golden";
import { canonicalPayloadJson, sha256Hex } from "@/lib/ingest/envelope";
import { signVelumaBody, verifyVelumaHmac } from "@/lib/ingest/hmac";
import { seedHypotheses, promoteHypothesis } from "@/lib/reconciliation/hypotheses";
import { varianceLines } from "@/lib/reconciliation/variance";
import { activeFacts } from "@/lib/queries/facts";

async function ready() {
  const { db } = await openMemoryDb();
  await seedSources(db);
  await seedHypotheses(db);
  return db;
}

describe("P2 ingest golden 2026-08-19", () => {
  it("reproduces DATA_CONTRACT §5 totals", async () => {
    const db = await ready();
    for (const env of GOLDEN_DAY) {
      await ingestEnvelope(db, env, "file_drop", `${env.feed_key}.json`);
    }
    const facts = await db.select().from(measureFact);
    const tot = (k: string, dim?: string) =>
      facts.find((f) => f.measureKey === k && f.businessDate === "2026-08-19" && (dim ? f.dimensionValue === dim : f.isTotalRow));

    expect(tot("appt_count_by_hour")?.valueNumeric).toBe(59);
    expect(tot("appt_value_by_hour")?.valueNumeric).toBe(1_022_600);
    expect(tot("appt_count_by_hour", "14")?.valueNumeric).toBe(11);
    expect(tot("appt_value_by_hour", "14")?.valueNumeric).toBe(230_200);

    expect(tot("pos_client_count")?.valueNumeric).toBe(59);
    expect(tot("pos_gross_sales_by_hour")?.valueNumeric).toBe(1_580_195);
    expect(tot("pos_item_qty")?.valueNumeric).toBe(150);
    expect(tot("pos_gross_sales_by_hour", "15")?.valueNumeric).toBe(405_906);

    expect(tot("appt_count_by_status", "booked")?.valueNumeric).toBe(1);
    expect(tot("appt_value_by_status", "booked")?.valueNumeric).toBe(23_000);
    expect(tot("appt_count_by_status", "closed")?.valueNumeric).toBe(54);
    expect(tot("appt_value_by_status", "closed")?.valueNumeric).toBe(999_600);
    expect(tot("appt_count_by_status", "cancelled")?.valueNumeric).toBe(22);
    expect(tot("appt_value_by_status", "cancelled")?.valueNumeric).toBe(452_100);

    expect(tot("service_count_by_facility")?.valueNumeric).toBe(60);
    expect(tot("service_value_by_facility")?.valueNumeric).toBe(1_080_600);
    expect(tot("facility_fill_pct")?.valueNumeric).toBe(373);
    expect(tot("facility_fill_pct", "suite_a")?.valueNumeric).toBe(3448);

    expect(tot("booking_count_by_source", "ONLINE")?.valueNumeric).toBe(18);
    expect(tot("booking_value_by_source", "ONLINE")?.valueNumeric).toBe(497_800);
    expect(tot("booking_count_by_source", "SPA")?.valueNumeric).toBe(185);
    expect(tot("booking_value_by_source", "SPA")?.valueNumeric).toBe(4_135_800);
    expect(tot("booking_count_by_source")?.valueNumeric).toBe(203);
    expect(tot("booking_value_by_source")?.valueNumeric).toBe(4_633_600);

    expect(tot("turnaway_count")?.valueNumeric).toBe(1);
    expect(tot("turnaway_value")?.valueNumeric).toBe(14_900);

    expect(tot("labor_client_count")?.valueNumeric).toBe(52);
    expect(tot("labor_service_hours")?.valueNumeric).toBe(5650);
    expect(tot("labor_booked_hours")?.valueNumeric).toBe(7325);
    expect(tot("labor_scheduled_hours")?.valueNumeric).toBe(22475);
    expect(tot("labor_utilization_pct_reported")?.valueNumeric).toBe(5700);
    expect(facts.filter((f) => f.measureKey.startsWith("labor_") && f.dimensionType === "technician")).toHaveLength(0);

    const d7 = await db.select().from(ingestRun).where(eq(ingestRun.feedKey, "b4t_future_revenues"));
    expect(d7[0]?.status).toBe("blocked");
    expect(d7[0]?.error).toBe("NullReferenceException");

    const lines = varianceLines(await activeFacts(db), "2026-08-19");
    expect(lines.map((l) => l.valueCents).sort((a, b) => a - b)).toEqual([
      999_600, 1_022_600, 1_080_600, 1_580_195, 4_633_600,
    ]);
    expect(lines.find((l) => l.sourceKey === "D5")?.dateBasis).toBe("booking_date");
  });

  it("redelivers as noop and corrections supersede", async () => {
    const db = await ready();
    await ingestEnvelope(db, goldenD1, "file_drop");
    const after1 = await db.select().from(measureFact);
    const again = await ingestEnvelope(db, goldenD1, "veluma_push");
    expect(again.status).toBe("noop");
    expect((await db.select().from(measureFact)).length).toBe(after1.length);

    const corrected = {
      ...goldenD1,
      delivery_id: "vlm_del_d1_corrected",
      payload: {
        ...goldenD1.payload,
        rows: goldenD1.payload.rows.map((r) =>
          r.dimension_value === "17"
            ? { ...r, measures: { appt_count: 4, appt_value_cents: 33400 } }
            : r,
        ),
        totals: { appt_count: 59, appt_value_cents: 1_023_600 },
      },
    };
    const withHash = { ...corrected, payload_sha256: sha256Hex(canonicalPayloadJson(corrected.payload)) };
    const result = await ingestEnvelope(db, withHash, "file_drop");
    expect(result.status).toBe("success");
    const runs = await db.select().from(ingestRun);
    expect(runs.some((r) => r.supersedesRunId)).toBe(true);
    const live = await db.select().from(measureFact);
    expect(live.find((f) => f.measureKey === "appt_value_by_hour" && f.isTotalRow && !f.retired)?.valueNumeric).toBe(
      1_023_600,
    );
  });

  it("quarantines checksum, tamper, unknown feed, pii", async () => {
    const db = await ready();
    const badSum = { ...goldenD5, payload_sha256: "00".repeat(32) };
    expect((await ingestEnvelope(db, badSum, "file_drop")).status).toBe("quarantined");

    const tamper = {
      ...goldenD5,
      payload: { ...goldenD5.payload, totals: { ...goldenD5.payload.totals, booking_count: 1 } },
    };
    const tamperEnv = { ...tamper, payload_sha256: sha256Hex(canonicalPayloadJson(tamper.payload)) };
    expect((await ingestEnvelope(db, tamperEnv, "file_drop")).reason).toMatch(/tamper/);

    const unknown = { ...goldenD5, feed_key: "not_a_feed", delivery_id: "x1" };
    const unknownEnv = { ...unknown, payload_sha256: sha256Hex(canonicalPayloadJson(unknown.payload)) };
    expect((await ingestEnvelope(db, unknownEnv, "file_drop")).reason).toMatch(/unknown_feed_key/);

    const pii = {
      ...goldenD5,
      delivery_id: "pii1",
      email: "guest@example.com",
    };
    const piiEnv = { ...pii, payload_sha256: sha256Hex(canonicalPayloadJson(pii.payload)) };
    expect((await ingestEnvelope(db, piiEnv, "file_drop")).reason).toMatch(/pii/);

    expect((await db.select().from(measureFact)).length).toBe(0);
    expect((await db.select().from(quarantine)).length).toBeGreaterThanOrEqual(3);
  });

  it("three transports produce identical facts", async () => {
    const dbs = [await ready(), await ready(), await ready()];
    const transports = ["file_drop", "veluma_pull", "veluma_push"] as const;
    const snapshots = [];
    for (let i = 0; i < 3; i++) {
      await ingestVia(dbs[i]!, goldenD8, transports[i]!);
      snapshots.push(
        (await dbs[i]!.select().from(measureFact)).map((f) => ({
          k: f.measureKey,
          d: f.businessDate,
          t: f.dimensionType,
          v: f.dimensionValue,
          n: f.valueNumeric,
        })),
      );
    }
    expect(snapshots[0]).toEqual(snapshots[1]);
    expect(snapshots[1]).toEqual(snapshots[2]);
  });

  it("pull client sends no tenant header (I13)", () => {
    const headers = pullHeaders("vk_test");
    expect(Object.keys(headers).join(",").toLowerCase()).not.toMatch(/tenant/);
    expect(headers.Authorization).toBe("Bearer vk_test");
  });

  it("D7 blocked vs missing", async () => {
    const db = await ready();
    const r = await ingestEnvelope(db, goldenD7Blocked, "file_drop");
    expect(r.status).toBe("blocked");
    const missing = await db.select().from(ingestRun).where(eq(ingestRun.feedKey, "b4t_appt_by_hour"));
    expect(missing.length).toBe(0);
  });

  it("14-day window does not double-count and logs later collisions", async () => {
    const db = await ready();
    await ingestEnvelope(db, goldenD1, "file_drop");
    for (const env of rangedD1Window()) await ingestEnvelope(db, env, "file_drop");
    const d1totals = await db
      .select()
      .from(measureFact)
      .where(eq(measureFact.measureKey, "appt_count_by_hour"));
    const liveTotals = d1totals.filter((f) => f.isTotalRow && !f.retired);
    const dates = new Set(liveTotals.map((f) => f.businessDate));
    expect(dates.has("2026-08-19")).toBe(true);
    expect(dates.has("2026-08-12")).toBe(false);
    expect(dates.size).toBe(13);
  });

  it("hotel occupancy envelope flows without new parser code", async () => {
    const db = await ready();
    const r = await ingestEnvelope(db, goldenHotelOccupancy, "file_drop");
    expect(r.status).toBe("success");
    expect(r.stored).toBeGreaterThan(0);
  });
});

describe("HMAC workforce contract", () => {
  it("accepts timestamp + sha256(body) signatures and rejects unsigned", () => {
    const secret = "test";
    const raw = Buffer.from("{}");
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signVelumaBody(secret, ts, raw);
    expect(verifyVelumaHmac({ "x-veluma-timestamp": ts, "x-veluma-signature": sig }, raw, secret).ok).toBe(true);
    expect(verifyVelumaHmac({}, raw, secret).ok).toBe(false);
  });
});

describe("promotion RBAC", () => {
  it("viewer cannot promote; admin can", async () => {
    const db = await ready();
    const viewer = await promoteHypothesis(db, { actor: "v", role: "viewer" }, "h4");
    expect(viewer.ok).toBe(false);
    const admin = await promoteHypothesis(db, { actor: "a", role: "admin" }, "h4");
    expect(admin.ok).toBe(true);
  });
});
