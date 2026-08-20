import { describe, expect, it } from "vitest";
import { openMemoryDb } from "@/db/client";
import { seedSources } from "@/db/sources";
import { seedHypotheses, promoteHypothesis } from "@/lib/reconciliation/hypotheses";
import { ingestEnvelope } from "@/lib/ingest/pipeline";
import { GOLDEN_DAY, goldenHotelOccupancy } from "@/lib/ingest/fixtures/golden";
import { allGatesPass, evaluateGates } from "@/lib/gates";
import { logLogElasticity, SYNTHETIC_ELASTICITY_FIXTURE } from "@/lib/pricing/model";
import { measureFact, source } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canonicalPayloadJson, sha256Hex } from "@/lib/ingest/envelope";

describe("P7 gates", () => {
  it("all seven fail on golden day data", async () => {
    const { db } = await openMemoryDb();
    await seedSources(db);
    await seedHypotheses(db);
    for (const env of GOLDEN_DAY) await ingestEnvelope(db, env, "file_drop");
    const gates = await evaluateGates(db);
    expect(gates).toHaveLength(7);
    expect(allGatesPass(gates)).toBe(false);
    expect(gates.every((g) => !g.passing)).toBe(true);
  });

  it("synthetic elasticity fixtures never reach the database", async () => {
    const { db } = await openMemoryDb();
    await seedSources(db);
    const e = logLogElasticity(SYNTHETIC_ELASTICITY_FIXTURE);
    expect(e).not.toBeNull();
    const hits = await db.select().from(measureFact);
    expect(hits.length).toBe(0);
    expect(SYNTHETIC_ELASTICITY_FIXTURE[0]?.priceCents).toBe(15000);
  });

  it("gates can all pass when collection is complete", async () => {
    const { db } = await openMemoryDb();
    await seedSources(db);
    await seedHypotheses(db);
    await promoteHypothesis(db, { actor: "a", role: "admin" }, "h4");
    await ingestEnvelope(db, goldenHotelOccupancy, "file_drop");

    const master = {
      envelope_version: "1" as const,
      delivery_id: "master1",
      feed_key: "b4t_service_price_master",
      delivered_at: "2026-08-20T00:00:00Z",
      origin: {
        system: "book4time",
        report_code: null,
        report_name: "service-price-master",
        location: "x",
        pulled_at: "2026-08-20T00:00:00Z",
        business_date_from: "2026-08-19",
        business_date_to: "2026-08-19",
        date_basis: "service_date" as const,
      },
      status: "ok" as const,
      blocked_reason: null,
      payload: {
        format: "b4t_report_rows_v1",
        rows: [
          { dimension_type: "service", dimension_value: "s1", measures: { list_price_cents: 15000 } },
          { dimension_type: "service", dimension_value: "s1b", measures: { list_price_cents: 18000 } },
          { dimension_type: "service", dimension_value: "s1c", measures: { list_price_cents: 21000 } },
        ],
        totals: { list_price_cents: 54000 },
      },
      payload_sha256: "",
    };
    master.payload_sha256 = sha256Hex(canonicalPayloadJson(master.payload));
    await ingestEnvelope(db, master, "file_drop");

    const hist = { ...master, delivery_id: "hist1", feed_key: "b4t_price_change_history" };
    hist.payload_sha256 = sha256Hex(canonicalPayloadJson(hist.payload));
    await ingestEnvelope(db, hist, "file_drop");

    const start = new Date("2023-01-01T00:00:00Z");
    for (let i = 0; i < 730; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      await db.insert(measureFact).values({
        id: `obs_${i}`,
        ingestRunId: "seed",
        sourceId: "src_d1",
        measureKey: "appt_count_by_hour",
        businessDate: iso,
        dimensionType: "total",
        dimensionValue: null,
        valueNumeric: 10,
        unit: "count",
        isTotalRow: true,
        retired: false,
      });
    }

    await db.update(source).set({ status: "active", blockedReason: null }).where(eq(source.key, "D7"));

    const gates = await evaluateGates(db);
    expect(allGatesPass(gates), JSON.stringify(gates.map((g) => [g.id, g.passing, g.current]))).toBe(true);
  });
});
